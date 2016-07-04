export default {
  entry: 'src/transpozor.js',
  // sourceMap: true,
  targets: [
    { dest: 'transpozor.cjs.js', format: 'cjs' },
    { dest: 'transpozor.js', format: 'es' },
  ],
}