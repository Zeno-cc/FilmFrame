import type { DarkroomGalleryPhoto } from './darkroomGallery';

const PUBLIC_DOMAIN = 'https://commons.wikimedia.org/wiki/Commons:Licensing#Public_domain';

interface BundledDocumentary {
  pageId: number;
  title: string;
  artist: 'Dorothea Lange' | 'Gordon Parks' | 'Walker Evans';
  sourcePath: string;
  file: string;
  width: number;
  height: number;
}

const DOCUMENTARIES: BundledDocumentary[] = [
  { pageId: 52734, title: 'Migrant Mother', artist: 'Dorothea Lange', sourcePath: 'Lange-MigrantMother02.jpg', file: '01-migrant-mother.jpg', width: 960, height: 1248 },
  { pageId: 1287239, title: 'American Gothic', artist: 'Gordon Parks', sourcePath: 'Gordon_Parks_-_American_Gothic.jpg', file: '02-american-gothic.jpg', width: 960, height: 1358 },
  { pageId: 2245704, title: 'Shoeshine stand', artist: 'Walker Evans', sourcePath: 'Walker_Evans_shoeshine_stand.jpg', file: '03-shoeshine-stand.jpg', width: 960, height: 768 },
  { pageId: 11161355, title: 'Gas station price analysis, Santa Fe, 1938', artist: 'Dorothea Lange', sourcePath: 'Dorothea_Lange,_Gas_station_price_analysis,_Santa_Fe,_New_Mexico,_1938.jpg', file: '04-gas-station.jpg', width: 960, height: 889 },
  { pageId: 177688553, title: 'Ella Watson and her family', artist: 'Gordon Parks', sourcePath: 'Ella_Watson_-_Gordon_Parks_LOC_2017765091.jpg', file: '05-ella-watson-family.jpg', width: 960, height: 764 },
  { pageId: 3290916, title: 'New Orleans street corner', artist: 'Walker Evans', sourcePath: 'Walker_Evans_New_Orleans_street_corner_B.jpg', file: '06-street-corner.jpg', width: 960, height: 568 },
  { pageId: 11161368, title: "Pea pickers' children, Nipomo, 1935", artist: 'Dorothea Lange', sourcePath: "Dorothea_Lange,_Pea_pickers'_children,_Nipomo,_California,_1935.jpg", file: '07-pea-pickers-children.jpg', width: 960, height: 1010 },
  { pageId: 121434779, title: 'Roadside sandwich shop, Ponchatoula, 1936', artist: 'Walker Evans', sourcePath: 'Roadside_sandwich_shop._Ponchatoula,_Louisiana,_1936-02.jpg', file: '08-roadside-sandwich-shop.jpg', width: 960, height: 712 },
  { pageId: 11160803, title: 'Penny Picture Display', artist: 'Walker Evans', sourcePath: 'Walker_Evans,_Penny_Picture_Display.jpg', file: '09-penny-picture-display.jpg', width: 960, height: 1208 },
  { pageId: 16852192, title: 'Pledge of Allegiance', artist: 'Dorothea Lange', sourcePath: 'Dorothea_Lange_pledge_of_allegiance.jpg', file: '10-pledge-of-allegiance.jpg', width: 960, height: 768 },
  { pageId: 177688554, title: 'Ella Watson with the American flag', artist: 'Gordon Parks', sourcePath: 'Ella_Watson_-_Gordon_Parks_LOC_2017765075.jpg', file: '11-ella-watson-flag.jpg', width: 821, height: 1024 },
  { pageId: 33722198, title: 'General store interior, Alabama', artist: 'Walker Evans', sourcePath: 'General_store_interior_Alabama_Walker_Evans.jpg', file: '12-general-store.jpg', width: 960, height: 757 },
];

export const BUNDLED_PHOTOS: DarkroomGalleryPhoto[] = DOCUMENTARIES.map(photo => ({
  id: `bundled-documentary-${photo.pageId}`,
  assetId: '',
  title: photo.title,
  artist: photo.artist,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${photo.sourcePath}`,
  licenseName: 'Public domain',
  licenseUrl: PUBLIC_DOMAIN,
  width: photo.width,
  height: photo.height,
  imageUrl: `/images/documentary/${photo.file}`,
}));

export const BUNDLED_PHOTO = BUNDLED_PHOTOS[0];
