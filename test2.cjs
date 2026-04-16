const Cube = require('cubejs');
Cube.initSolver();
const cube = Cube.fromString('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
console.log(cube.solve());
