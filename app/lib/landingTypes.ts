export type RoomBedSummary = {
  name: string;
  quantity: number;
};

export type RoomImage = {
  fileUrl: string;
  altText?: string;
};

export type FeaturedRoom = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  maxGuests: number;
  nightlyRate: number;
  halfDayRate?: number;
  wholeDayRate?: number;
  primaryImage?: string;
  primaryImageAlt?: string;
  images?: RoomImage[];
  beds?: RoomBedSummary[];
  features?: string[];
  amenities?: string[];
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