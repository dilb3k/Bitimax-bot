/**
 * One-shot migration from the v1 schema to v2.
 *
 * Run with: npm run migrate
 *
 * It is safe to run more than once — every step checks whether it already applied. Take a
 * database snapshot first anyway; this rewrites credentials in place.
 */
import mongoose from 'mongoose';
import { connectDatabase } from '../db/mongoose';
import { Product } from '../models/Product';
import { EscrowHold } from '../models/EscrowHold';
import { Transaction } from '../models/Transaction';
import { User } from '../models/User';
import { LedgerEntry } from '../models/LedgerEntry';
import { ledgerService, accounts } from '../services/ledgerService';
import { encryptSecret, isEncrypted } from '../utils/crypto';
import { refundDeadlineFrom } from '../services/refundEngine';
import { config } from '../config';
import crypto from 'crypto';

/**
 * v1 put a TTL index on Transaction.expireAt, which deleted pending transactions the moment
 * their window closed. Mongoose will not drop an index it no longer declares, so it has to go
 * explicitly or expired orders keep vanishing along with the audit trail.
 */
async function dropTransactionTtlIndex() {
  const collection = mongoose.connection.collection('transactions');
  const indexes = await collection.indexes();
  const ttl = indexes.find((i: any) => i.expireAfterSeconds !== undefined && i.key?.expireAt === 1);

  if (!ttl) {
    console.log('  ✓ No TTL index on transactions.expireAt (already migrated)');
    return;
  }

  await collection.dropIndex(ttl.name as string);
  console.log(`  ✓ Dropped TTL index "${ttl.name}" — expired transactions are now retained`);
}

/** Encrypts any credential still stored as plaintext. */
async function encryptExistingCredentials() {
  const products = await Product.find({ credentialsPurgedAt: { $exists: false } }).select(
    'sensitiveData'
  );

  let migrated = 0;
  for (const product of products) {
    const data = product.sensitiveData;
    if (!data?.login || isEncrypted(data.login)) continue;

    await Product.updateOne(
      { _id: product._id },
      {
        $set: {
          'sensitiveData.login': encryptSecret(data.login),
          'sensitiveData.password': encryptSecret(data.password),
          ...(data.recoveryCode ? { 'sensitiveData.recoveryCode': encryptSecret(data.recoveryCode) } : {}),
          ...(data.additionalInfo
            ? { 'sensitiveData.additionalInfo': encryptSecret(data.additionalInfo) }
            : {}),
        },
      }
    );
    migrated += 1;
  }

  console.log(`  ✓ Encrypted credentials for ${migrated} product(s)`);
}

/** Fills in the deadline fields v2 added to EscrowHold. */
async function backfillEscrowDeadlines() {
  const holds = await EscrowHold.find({ autoReleaseAt: { $exists: false } });

  for (const hold of holds) {
    const start = hold.credentialsRevealedAt || hold.boughtAt;
    const graceHours = hold.credentialsRevealedAt
      ? config.autoReleaseHours
      : config.unrevealedGraceHours;

    await EscrowHold.updateOne(
      { _id: hold._id },
      {
        $set: {
          autoReleaseAt: new Date(start.getTime() + graceHours * 3600_000),
          refundDeadlineAt: refundDeadlineFrom(start),
          credentialRevealCount: hold.credentialRevealCount ?? 0,
        },
      }
    );
  }

  console.log(`  ✓ Backfilled deadlines for ${holds.length} escrow hold(s)`);
}

/**
 * Seeds the ledger so it agrees with the balances v1 accumulated by `$inc`.
 *
 * Without this, the reconciliation job would report every existing user as drifting. The
 * opening entry is explicitly labelled so it is obvious in an audit that these balances
 * predate double-entry bookkeeping and were not derived from journalled movements.
 */
async function seedOpeningBalances() {
  const existing = await LedgerEntry.countDocuments({ type: 'manual_adjustment' });
  if (existing > 0) {
    console.log('  ✓ Opening balances already seeded');
    return;
  }

  const users = await User.find({ balance: { $ne: 0 } }).select('balance');
  for (const user of users) {
    await ledgerService.post({
      key: `opening:${user._id}`,
      type: 'manual_adjustment',
      postings: [
        { account: accounts.externalBank, amount: -user.balance },
        { account: accounts.userAvailable(String(user._id)), amount: user.balance },
      ],
      refType: 'User',
      refId: user._id as mongoose.Types.ObjectId,
      meta: { note: 'v1 → v2 opening balance (pre-ledger)' },
    });
  }

  console.log(`  ✓ Seeded opening balances for ${users.length} user(s)`);
}

/** Gives every existing user a referral code. */
async function backfillReferralCodes() {
  const users = await User.find({ referralCode: { $exists: false } }).select('_id');
  for (const user of users) {
    await User.updateOne(
      { _id: user._id },
      { $set: { referralCode: crypto.randomBytes(4).toString('hex') } }
    );
  }
  console.log(`  ✓ Generated referral codes for ${users.length} user(s)`);
}

/** v1 defaulted products to `active`; v2 routes new listings through moderation. */
async function normalizeProductStatuses() {
  const result = await Transaction.updateMany(
    { status: 'pending_payment', expireAt: { $lt: new Date() } },
    { $set: { status: 'expired', cancelReason: 'migrated_expired' } }
  );
  console.log(`  ✓ Marked ${result.modifiedCount} stale pending transaction(s) as expired`);
}

async function main() {
  console.log('\n▶ Bitimax v1 → v2 migration\n');
  await connectDatabase();

  await dropTransactionTtlIndex();
  await encryptExistingCredentials();
  await backfillEscrowDeadlines();
  await backfillReferralCodes();
  await normalizeProductStatuses();
  await seedOpeningBalances();

  const drift = await ledgerService.findBalanceDrift();
  if (drift.length > 0) {
    console.warn(`\n⚠ ${drift.length} account(s) still drift from the ledger:`, drift.slice(0, 5));
  } else {
    console.log('\n✓ Ledger and cached balances agree');
  }

  console.log('\n✓ Migration complete\n');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n✗ Migration failed:', err);
  process.exit(1);
});
