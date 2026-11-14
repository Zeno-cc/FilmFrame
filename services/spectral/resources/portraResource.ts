import rawPortraSetup from './portra-setup.json';
import { decodePortraSetupResource, verifyPortraResourceDigests } from '../setup';

/** Explicit boundary for the bundled, digest-verified research resource. */
export const portraResource = decodePortraSetupResource(rawPortraSetup);
export const portraResourceIntegrity = verifyPortraResourceDigests(portraResource);
