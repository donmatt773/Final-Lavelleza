export type FeaturedRoom = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  maxGuests: number;
  nightlyRate: number;
  primaryImage?: string;
  primaryImageAlt?: string;
};

export type FeaturedPromo = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  packagePrice: number;
  includedPax?: number;
  bannerUrl?: string;
  bannerAlt?: string;
};