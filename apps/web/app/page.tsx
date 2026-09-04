'use client';

import LegacyDashboard from './legacy-dashboard';
import { DashboardEnhancer } from './dashboard-enhancer';

export default function HomePage() {
  return (
    <>
      <LegacyDashboard />
      <DashboardEnhancer />
    </>
  );
}
