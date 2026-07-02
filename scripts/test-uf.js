import { valorUF, ufAClp } from '../src/tools/uf.js';

const uf = await valorUF();
console.log('Valor UF:', uf);
console.log('Ejemplo: UF 2.849 =', '$' + ufAClp(2849, uf.valor), 'CLP');
