import { STOCK_RESOURCES } from '../../services/spectral/resources/stockResources.ts';
import { solveBaseCancelingHoleDensity } from '../../services/physical135/density.ts';
for (const [id, resource] of Object.entries(STOCK_RESOURCES)) {
  const solution = solveBaseCancelingHoleDensity(resource.arrays.filmChannelDensity.values, resource.arrays.filmBaseDensity.values, resource.arrays.filmSpectralValidMask.values);
  console.log(JSON.stringify({ id, residual: solution.maxBaseResidual, cmy: solution.cmy }));
}
