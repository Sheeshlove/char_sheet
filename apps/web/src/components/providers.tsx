'use client';
import * as React from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TRPCReactProvider } from '@/lib/trpc/client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <TRPCReactProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster richColors closeButton position="top-center" />
        </TooltipProvider>
      </TRPCReactProvider>
    </ThemeProvider>
  );
}
