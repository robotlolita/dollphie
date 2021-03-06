// # module: Dollphie.output.rst
//
// Outputs documentation as ReStructuredText

// -- Dependencies -----------------------------------------------------
var extend = require('xtend');
var { curry } = require('core.lambda');
var { unary } = require('core.arity');
var { Value: { Symbol, Tagged, Raw }} = require('../../language/data');
var pp = require('text.pretty-printing');
var poly = require('polygamous');
var Maybe = require('data.maybe');
var show = require('core.inspect');

// -- Helpers ----------------------------------------------------------
// @type: Int, String → String
function repeat(n, s) {
  return Array(n + 1).join(s)
}

// @type: a → Boolean
function isBool(x) {
  return typeof x === "boolean"
}

// @type: Int → String
function charFor(depth) {
  var chars = ['*', '=', '-', '~', '^', '"', '\''];
  return chars[Math.min(~~depth, chars.length)]
}

// @type: PrettyPrinter.DOC → [PrettyPrinter.DOC]
function maybe(x) {
  return pp.nil().equals(x)? [] : [x]
}

// @type: Array(String) → String
function qualifiedName(xs) {
  return xs.join('.')
}

// @type: Array(String) → String
function name(xs) {
  return xs[xs.length - 1]
}

// @type: Array(PrettyPrinter.DOC) → PrettyPrinter.DOC
function join(xs) {
  return pp.foldDoc(pp.concat, xs)
}

// @type: String | null → PrettyPrinter.DOC
function typeSignature(s) {
  return Maybe.fromNullable(s).cata({
    Nothing: pp.nil,
    Just:    λ[code('haskell', #)]
  })
}

// @type: String → PrettyPrinter.DOC
function lines(s) {
  return pp.stack(s.split(/\r\n|\r|\n/).map(pp.text))
}

// @type: Array(a) → a :: throws
function second(xs) {
  if (!(1 in xs))
    throw new RangeError('1 out of bounds in ' + show(xs));

  return xs[1]
}

// @type: Object(String) → [(String, String)]
function items(o) {
  return Object.keys(o).map(λ(k) -> [k, o[k]])
}

// @type: Boolean, Int, String → PrettyPrinter.DOC
function title(rubric, depth, s) {
  return pp.stack([
    pp.line(),

    rubric?  pp.text('.. rubric:: ' + s)
    :        (pp.text(s) +++ pp.line() +++ pp.text(repeat(s.length, charFor(depth)))),

    pp.line()
  ])
}

// @type: String | null, String, Options → PrettyPrinter.DOC
function code(lang, s, opts) {
  opts = opts || {};
  return directive('code-block',
                   Maybe.fromNullable(lang),
                   {
                     'caption': opts.caption,
                     'linenos': opts['line-numbers'],
                     'emphasize-lines': opts['emphasise-lines'] 
                   },
                   lines(s))
}

// @type: Object(String) → PrettyPrinter.DOC
function options(opts) {
  return pp.stack(items(opts).filter(second ->> Boolean).map(render) +++ [pp.line()]);

  function render(item) {
    var [name, v] = item;
    return pp.text(':' + name + ':') +++ ( isBool(v)?       pp.nil()
                                         : /* otherwise */  pp.nest(2, pp.line() +++ lines(v)))
  }
}

// @type: String, Maybe(String), Object(String), PrettyPrinter.DOC → PrettyPrinter.DOC
function directive(name, arg, opts, content) {
  return pp.stack([
    pp.line(),
    pp.text('.. ' + name + ':: ' + arg.getOrElse(''))
    +++ pp.nest(3, pp.stack([
          pp.line() +++ options(opts),
          content,
        ])),
    pp.line()
  ])
}

// @type: Object(String) → PrettyPrinter.DOC
function commonOptions(x) {
  return options({})
}

// @type: Int, Section → PrettyPrinter.DOC
function section(rubric, depth, x) {
  return  title(rubric, depth, x.title)
      +++ pp.stack(x.children.map(unary(generate(rubric, depth + 1))))
}

// @type: { description: String, name: String? } → String | null
function renderThrows(x) {
  return !x?      null
  :      x.name?  '**' + x.name + '** - ' + x.description
  :      /* _ */  x.description
}

// @type: Int, String, String, String, Declaration → PrettyPrinter.DOC
function funcDecl(rubric, depth, kind, name, signature, x) {
  name = /\(.*?\)/.test(name)? name : name + '()';
  return pp.stack([
    pp.text('.. rst-class:: hidden-heading'),
    pp.line(),
    title(rubric, depth, name),
    directive(
      kind,
      Maybe.Just(signature),
      {},
      pp.stack(maybe(typeSignature(x.meta.type)) +++ [
        commonOptions(x.meta)
        +++ options({
          "Returns": x.meta.returns,
          "Throws": renderThrows(x.meta['throws'])
        }),
        pp.line()
      ] +++ x.children.map(unary(generate(true, depth + 1))))
    )
  ])
}

// @type: Int, Declaration → PrettyPrinter.DOC
var declaration = poly(function(_, _, x){ return x.kind });

declaration.when('module', function _module(rubric, depth, x) {
  return pp.stack([
    title(rubric, depth, 'Module: ``' + name(x.meta.name) + '``'),
    directive(
      'module', Maybe.Just(qualifiedName(x.meta.name)),
      {
        "synopsis": x.meta['synopsis'],
        "platform": x.meta['platform']
      },
      pp.nil()
    ),
  ] +++ maybe(typeSignature(x.meta.type)) +++ [
    options({
      "Stability": x.meta.stability,
      "Portability": x.meta.portability
    }) +++ commonOptions(x.meta),
  ] +++ x.children.map(unary(generate(rubric, depth + 1))))
});

declaration.when('class', function _function(rubric, depth, x) {
  return pp.stack([
    title(rubric, depth, 'Class: ``' + x.meta.name + '``'),
    directive(
      'class', Maybe.Just(x.meta.signature),
      {},
      pp.stack(maybe(typeSignature(x.meta.type)) +++ [
        options({
          "Parents": x.meta.parents
        }) +++ commonOptions(x.meta),
        pp.line()
      ])
    ),
  ] +++ x.children.map(unary(generate(rubric, depth + 1))))
})

declaration.when('function', function _function(rubric, depth, x) {
  return funcDecl(rubric, depth,
                  'function', x.meta.name,
                  x.meta.signature,
                  x)
})
declaration.when('method', function _function(rubric, depth, x) {
  return funcDecl(rubric, depth,
                  'method', '#' + x.meta.name,
                  x.meta.signature,
                  x)
})

// @type: PrettyPrinter.DOC → PrettyPrinter.DOC
function listItem(x) {
  return pp.text('* ') +++ pp.nest(3, x)
}

// @type: PrettyPrinter.DOC → PrettyPrinter.DOC
function listOrdItem(x) {
  return pp.text('#. ') +++ pp.nest(4, x)
}



// -- Implementation ---------------------------------------------------
generate = curry(3, generate);
function generate(rubric, depth, ast) {
  return match ast {
    Tagged(Symbol('declaration'), x) => declaration(rubric, depth, x),
    Tagged(Symbol('section'), x)     => section(rubric, depth, x),


    Tagged(Symbol('paragraph'), xs) =>
      pp.stack(xs.map(unary(generate(rubric, depth))) +++ [pp.line()]),

    Tagged(Symbol('text'), xs) =>
      join(xs.map(unary(generate(rubric, depth)))),

    Tagged(Symbol('soft-break')) =>
      pp.line(),

    Tagged(Symbol('line'), xs) =>
      pp.line() +++ pp.text('| ') +++ join(xs.map(unary(generate(rubric, depth)))),

    Tagged(Symbol('bold'), Tagged(Symbol('text'), xs)) =>
      pp.text('**') +++ join(xs.map(unary(generate(rubric, depth)))) +++ pp.text('**'),

    Tagged(Symbol('bold'), s @ String) => pp.text('**' + s + '**') ,

    Tagged(Symbol('italic'), Tagged(Symbol('text'), xs)) =>
      pp.text('*') +++ join(xs.map(unary(generate(rubric, depth)))) +++ pp.text('*'),

    Tagged(Symbol('italic'), s @ String) => pp.text('*' + s + '*'),

    Tagged(Symbol('literal'), s) =>
      pp.text('``' + s + '``'),

    Tagged(Symbol('link'), x) =>
      pp.text('`' + x.text + (x.url? ' <' + x.url + '>' : '') + '`_'),

    Tagged(Symbol('ref'), x) =>
      pp.line() +++ pp.text('.. _`' + x.id + '`: ' + x.url) +++ pp.line(),

    Tagged(Symbol('list'), xs) =>
      pp.line() +++ pp.stack(xs.map(generate(rubric, depth) ->> listItem)) +++ pp.line(),

    Tagged(Symbol('ordered-list'), xs) =>
      pp.line() +++ pp.stack(xs.map(generate(rubric, depth) ->> listOrdItem)) +++ pp.line(),

    Tagged(Symbol('note'), x) =>
      directive(x.kind, Maybe.Nothing(), {}, lines(x.text)),

    Tagged(Symbol('version-note'), x) =>
      directive('version' + x.kind, Maybe.Just(x.version), {}, lines(x.text)),

    Tagged(Symbol('example'), x) => code(x.language, x.code, x.options),
    Tagged(Symbol('code'), x) => code(x.language, x.code),
    Tagged(Symbol('meta'), *) => pp.nil(),

    Raw('ReST', s) => pp.text(s),
    Raw(*, *) => pp.nil(),
    xs @ Array => pp.stack(xs.map(unary(generate(rubric, depth)))),
    node => pp.text(String(node))
  }
}

function addComments(doc) {
  return pp.stack([
    pp.text('.. This file is auto-generated from Dollphie.'),
    pp.line(),
    doc
  ])
}

// -- Exports ----------------------------------------------------------
module.exports = {
  description: "Outputs documentation as Sphinx's ReStructured Text.",
  transformation: generate(false, 0) ->> addComments ->> pp.pretty(80)
}
