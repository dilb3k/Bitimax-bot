import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = new URLSearchParams(searchParams);

    const res = await fetch(`${BACKEND_URL}/api/escrow?${params}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch escrow holds' },
      { status: 500 }
    );
  }
}
