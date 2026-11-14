import portra160Setup from './kodak_portra_160-setup.json';
import portra800Setup from './kodak_portra_800-setup.json';
import portra800Push1Setup from './kodak_portra_800_push1-setup.json';
import portra800Push2Setup from './kodak_portra_800_push2-setup.json';
import gold200Setup from './kodak_gold_200-setup.json';
import ektar100Setup from './kodak_ektar_100-setup.json';
import ultramax400Setup from './kodak_ultramax_400-setup.json';
import fujiC200Setup from './fujifilm_c200-setup.json';
import fujiXtra400Setup from './fujifilm_xtra_400-setup.json';
import fujiPro400hSetup from './fujifilm_pro_400h-setup.json';
import vision50dSetup from './kodak_vision3_50d-setup.json';
import vision200tSetup from './kodak_vision3_200t-setup.json';
import vision250dSetup from './kodak_vision3_250d-setup.json';
import vision500tSetup from './kodak_vision3_500t-setup.json';
import { decodePortraSetupResource } from '../setup';
import type { PortraSetupResource } from '../types';

function decode(resource: unknown): PortraSetupResource {
  return decodePortraSetupResource(resource);
}

export const STOCK_RESOURCES = {
  portra160: decode(portra160Setup),
  portra800: decode(portra800Setup),
  portra800Push1: decode(portra800Push1Setup),
  portra800Push2: decode(portra800Push2Setup),
  gold200: decode(gold200Setup),
  ektar100: decode(ektar100Setup),
  ultramax400: decode(ultramax400Setup),
  fujiC200: decode(fujiC200Setup),
  fujiXtra400: decode(fujiXtra400Setup),
  fujiPro400h: decode(fujiPro400hSetup),
  vision50d: decode(vision50dSetup),
  vision200t: decode(vision200tSetup),
  vision250d: decode(vision250dSetup),
  vision500t: decode(vision500tSetup),
} as const;
