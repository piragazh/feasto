import React from 'react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/**
 * Retired. This was an older driver screen that wrote straight to the Order and
 * Driver tables from the phone, with no proof of delivery and one order at a time.
 * The driver app (DriverApp) replaces it; anyone with the old link is sent there.
 */
export default function DriverDashboard() {
    return <Navigate to={createPageUrl('DriverApp')} replace />;
}
