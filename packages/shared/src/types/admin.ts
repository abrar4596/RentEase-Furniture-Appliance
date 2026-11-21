export interface IAdminMetrics {
  checkoutInitiated: number;
  checkoutConfirmed: number;
  conversionPercent: number;
  deliveredWithin48Hours: number;
  deliveredTotal: number;
  deliveryWithin48Percent: number;
  activeRentalUnits: number;
  activeListedUnits: number;
  inventoryUtilizationPercent: number;
  maintenanceOpen: number;
  maintenanceResolved: number;
  maintenanceAverageResolutionHours: number | null;
}

export interface IAdminOrderSearchResult {
  id: string;
  renterId: string;
  status: string;
  totalUpfrontPaise: number;
  preferredDeliveryDate: string;
  createdAt: string;
  updatedAt: string;
  damageClaim?: {
    description: string;
    deductedPaise: number;
    disputed?: boolean;
  };
}
