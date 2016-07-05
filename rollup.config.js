export default {
  entry: 'src/transpozor.js',
  // sourceMap: true,
  targets: [
    { dest: 'dist/transpozor.cjs.js', format: 'cjs' },
    { dest: 'dist/transpozor.js', format: 'es' },
  ],
}
