import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';
import { HeaderNav } from '../components/layout/HeaderNav';

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
          <AuthProvider>
            {/* Header Navigation Shell */}
            <HeaderNav />

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
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
