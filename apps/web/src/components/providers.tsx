'use client';
import * as React from 'react';
import { Toaster } from 'sonner';
import { SerwistProvider } from '@serwist/turbopack/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TRPCReactProvider } from '@/lib/trpc/client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== 'production'} reloadOnOnline={false}>
      <TRPCReactProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster richColors closeButton position="top-center" />
        </TooltipProvider>
      </TRPCReactProvider>
    </SerwistProvider>
  );
}
