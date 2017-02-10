const rollup = require('rollup').rollup;
const rollupBuble = require('rollup-plugin-buble');
// const rollupJson = require('rollup-plugin-json');
// const rollupCommonjs = require('rollup-plugin-commonjs');
// const rollupNodeResolve = require('rollup-plugin-node-resolve');
// const rollupUglify = require('rollup-plugin-uglify');
const rollupPlugins = [
  rollupBuble({ /* jsx: 'h', */ }),
  // rollupJson(),
  // rollupNodeResolve({ jsnext: true, main: true, }),
  // rollupCommonjs(),
  // rollupUglify({ output: { comments: 'some', }, }),
];


export default {
  entry: 'src/transpozor.js',
  plugins: rollupPlugins,
  sourceMap: true,
  targets: [
    { dest: 'dist/transpozor.cjs.js', format: 'cjs' },
    { dest: 'dist/transpozor.js', format: 'es' },
  ],
}
