#!/usr/bin/env coffee
require 'shelljs/make'
fs = require 'fs'

mepto_js  = 'dist/mepto.js'
mepto_min = 'dist/mepto.min.js'
mepto_gz  = 'dist/mepto.min.gz'

port = 3999
root = __dirname + '/'

target.all = ->
  target[mepto_js]()
  target.test()

## TASKS ##

target.test = ->
  test_app = require './test/server'
  server = test_app.listen port
  exec "phantomjs --disk-cache=true test/runner.js 'http://localhost:#{port}/'", (code) ->
    server.close -> exit(code)

target[mepto_js] = ->
  target.build() unless test('-e', mepto_js)

target[mepto_min] = ->
  target.minify() if stale(mepto_min, mepto_js)

target[mepto_gz] = ->
  target.compress() if stale(mepto_gz, mepto_min)

target.dist = ->
  target.build()
  target.minify()
  target.compress()

target.build = ->
  cd __dirname
  mkdir '-p', 'dist'
  modules = (env['MODULES'] || 'mepto event ajax form ie').split(' ')
  module_files = ( "src/#{module}.js" for module in modules )
  intro = "/* mepto #{describe_version()} - #{modules.join(' ')} - meptojs.com/license */\n"
  dist = cat(module_files).replace(/^\/[\/*].*$/mg, '').replace(/\n{3,}/g, "\n\n")
  dist = cat('src/amd_layout.js').replace(/YIELD/, -> dist.trim()) unless env['NOAMD']
  (intro + dist).to(mepto_js)
  report_size(mepto_js)

target.minify = ->
  target.build() unless test('-e', mepto_js)
  mepto_code = cat(mepto_js)
  intro = mepto_code.slice(0, mepto_code.indexOf("\n") + 1)
  (intro + minify(mepto_code)).to(mepto_min)
  report_size(mepto_min)

target.compress = ->
  gzip = require('zlib').createGzip()
  inp = fs.createReadStream(mepto_min)
  out = fs.createWriteStream(mepto_gz)
  inp.pipe(gzip).pipe(out)
  out.on 'close', ->
    report_size(mepto_gz)
    factor = fsize(mepto_js) / fsize(mepto_gz)
    echo "compression factor: #{format_number(factor)}"

target.publish = ->
  tag = 'v' + package_version()
  if git_version() == tag
    rm '-f', mepto_js
    env['MODULES'] = env['NOAMD'] = ''
    target.dist()
    res = exec 'npm publish'
    exit res.code
  else
    console.error 'error: latest commit should be tagged with ' + tag
    exit 1

## HELPERS ##

stale = (file, source) ->
  target[source]()
  !test('-e', file) || mtime(file) < mtime(source)

mtime = (file) ->
  fs.statSync(file).mtime.getTime()

fsize = (file) ->
  fs.statSync(file).size

format_number = (size, precision = 1) ->
  factor = Math.pow(10, precision)
  decimal = Math.round(size * factor) % factor
  parseInt(size) + "." + decimal

report_size = (file) ->
  echo "#{file}: #{format_number(fsize(file) / 1024)} KiB"

package_version = ->
  JSON.parse(cat('package.json')).version

git_version = ->
  desc = exec "git --git-dir='#{root + '.git'}' describe --tags HEAD", silent: true
  desc.output.replace(/\s+$/, '') if desc.code is 0

describe_version = ->
  git_version() || package_version()

minify = (source_code) ->
  uglify = require('uglify-js')
  compressor = uglify.Compressor()
  ast = uglify.parse(source_code)
  ast.figure_out_scope()
  ast.compute_char_frequency()
  ast.mangle_names()
  ast = ast.transform(compressor)
  return ast.print_to_string()
