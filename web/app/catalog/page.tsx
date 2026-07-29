'use client';

import { useEffect, useState } from 'react';

interface Product {
  _id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  tags: string[];
  createdAt: string;
}

export default function CatalogPage() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeatured();
  }, []);

  async function fetchFeatured() {
    try {
      const res = await fetch('/api/products?limit=6&sort=-createdAt');
      const data = await res.json();
      setFeatured(data.products?.slice(0, 6) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function formatPrice(price: number): string {
    return price.toLocaleString('uz-UZ');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h1 className="text-4xl font-bold mb-4">Mahsulotlar Katalogi</h1>
          <p className="text-primary-100 text-lg max-w-2xl">
            Bitimax platformasidagi barcha raqamli mahsulotlarni ko'ring. Har bir xarid Escrow tizimi bilan himoyalangan.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">So'nggi qo'shilganlar</h2>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map((product) => (
              <div key={product._id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded">
                    {product.category}
                  </span>
                  <h3 className="text-lg font-semibold mt-3 mb-2">{product.title}</h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{product.description}</p>
                  <div className="flex items-center justify-between pt-4 border-t">
                    <span className="text-xl font-bold text-primary-600">{formatPrice(product.price)} UZS</span>
                    <a
                      href={`https://t.me/bitimax_bot?start=buy_${product._id}`}
                      target="_blank"
                      className="btn-primary text-sm"
                    >
                      Sotib olish
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center mt-12">
          <a
            href="/"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            ← Barcha mahsulotlarni ko'rish
          </a>
        </div>
      </div>
    </div>
  );
}
