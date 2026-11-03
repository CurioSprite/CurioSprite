// Regenerates public/favicon.svg from the logo data: `npm run favicon`
import { writeFileSync } from 'node:fs';
import { logoMarkSvg } from '../src/graphics/logoMark.ts';

writeFileSync(new URL('../public/favicon.svg', import.meta.url), logoMarkSvg('#0b1020'));
