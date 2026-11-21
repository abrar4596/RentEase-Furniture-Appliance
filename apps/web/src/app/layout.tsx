import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { ToastProvider } from '../components/ui/Toast';
import { MapPin } from 'lucide-react';

export const metadata: Metadata = {
  title: 'RentEase - Hyperlocal Furniture & Appliance Rentals',
  description:
    'Rent essential furniture and appliances in Tier-2/Tier-3 Indian cities with flexible tenures, ₹0 deposit options, and 24-48 hour delivery.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#059669',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-screen flex-col font-sans antialiased text-gray-900 bg-slate-50">
        <ToastProvider>
          {/* Header Navigation Shell */}
          <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
              {/* Logo & Tag */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-black text-white shadow-sm">
                  RE
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-bold tracking-tight text-gray-900 leading-tight">
                    RentEase
                  </span>
                  <span className="text-[11px] font-medium text-gray-500 tracking-wide uppercase">
                    Tier-2/3 Hyperlocal Rentals
                  </span>
                </div>
              </div>

              {/* City Selector Pill */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <MapPin className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                  <span className="hidden xs:inline">City:</span>
                  <span className="font-semibold text-gray-900">Select City / Pincode</span>
                </button>
              </div>
            </div>
          </header>

          {/* Main Page Content */}
          <main className="flex-1">{children}</main>

          {/* Footer */}
          <footer className="border-t border-gray-200 bg-white py-6 text-center text-xs text-gray-500">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <p>
                © {new Date().getFullYear()} RentEase Technologies Pvt. Ltd. All rights reserved.
              </p>
              <p className="mt-1 text-gray-400">
                Hyperlocal furniture & appliance rental marketplace for Tier-2 / Tier-3 India.
              </p>
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
