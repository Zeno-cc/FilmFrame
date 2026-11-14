import { solveBaseCancelingHoleDensity } from '../../services/physical135/density.ts';
import { portraResource } from '../../services/spectral/resources/portraResource.ts';

const a = [[0.8, 0.1, 0.05], [0.1, 0.65, 0.1], [0.04, 0.12, 0.55], [0.6, 0.15, 0.03]];
const normal = Array.from({ length: 3 }, () => [0, 0, 0]);
const target = [0, 0, 0];
for (const channels of a) {
  for (let row = 0; row < 3; row += 1) {
    target[row] -= channels[row] * 0.2;
    for (let column = 0; column < 3; column += 1) normal[row][column] += channels[row] * channels[column];
  }
}
console.log({ normal, target });

const solution = solveBaseCancelingHoleDensity(
  [0.8, 0.1, 0.05, 0.1, 0.65, 0.1, 0.04, 0.12, 0.55, 0.6, 0.15, 0.03],
  [0.2, 0.15, 0.12, 0.25],
  [1, 1, 1, 1],
);
console.log(solution);
console.log(a.map((channels, index) => 0.2 + channels.reduce((sum, value, channelIndex) => sum + value * solution.cmy[channelIndex], 0)));
console.log(solveBaseCancelingHoleDensity(
  portraResource.arrays.filmChannelDensity.values,
  portraResource.arrays.filmBaseDensity.values,
  portraResource.arrays.filmSpectralValidMask.values,
));
