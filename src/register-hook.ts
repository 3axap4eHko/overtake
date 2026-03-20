import { register } from 'node:module';

register(new URL('../build/loader-hook.js', import.meta.url).href);
