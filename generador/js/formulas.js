// ============================================================================
// EVALUADOR DE FÓRMULAS
// Calcula las opciones de respuesta de los problemas a partir de los datos
// del enunciado. Es un analizador propio (sin eval ni Function): solo
// números, variables, + - * / ^ %, paréntesis y las funciones de la lista.
//   FORMULAS.calcular('0.5*m*v^2', { m: 2, v: 3 })  →  { valor: 9, error: null }
//   FORMULAS.calcular('sqrt(2*h/g)', { h: 20 })      →  usa la constante g = 9.8
// ============================================================================
'use strict';

const FORMULAS = (() => {
  const RAD = Math.PI / 180;
  const FUNCIONES = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sind: (x) => Math.sin(x * RAD), cosd: (x) => Math.cos(x * RAD), tand: (x) => Math.tan(x * RAD),
    asind: (x) => Math.asin(x) / RAD, acosd: (x) => Math.acos(x) / RAD, atand: (x) => Math.atan(x) / RAD,
    ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, exp: Math.exp,
    pow: Math.pow, hypot: Math.hypot,
    round: (x, n) => { const f = Math.pow(10, n || 0); return Math.round(x * f) / f; },
    floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
    min: Math.min, max: Math.max,
    rad: (x) => x * RAD, deg: (x) => x / RAD,
  };
  const CONSTANTES = { pi: Math.PI, 'π': Math.PI, e: Math.E, g: 9.8 };

  const RE_NUM = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/;
  const RE_ID = /^[A-Za-zÀ-ɏͰ-Ͽ_][A-Za-z0-9À-ɏͰ-Ͽ_]*/;

  function tokenizar(src) {
    const tokens = [];
    // Los decimales van con punto (la coma separa argumentos: round(x, 2)).
    const s = String(src || '');
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      let m;
      if ((m = RE_NUM.exec(s.slice(i)))) {
        tokens.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if ((m = RE_ID.exec(s.slice(i)))) {
        tokens.push({ t: 'id', v: m[0] }); i += m[0].length; continue;
      }
      if ('+-*/^%(),'.indexOf(ch) >= 0) {
        tokens.push({ t: 'op', v: ch }); i++; continue;
      }
      if (ch === '×' || ch === '·') { tokens.push({ t: 'op', v: '*' }); i++; continue; }
      if (ch === '÷' || ch === ':') { tokens.push({ t: 'op', v: '/' }); i++; continue; }
      if (ch === '−') { tokens.push({ t: 'op', v: '-' }); i++; continue; }
      if (ch === '√') { tokens.push({ t: 'id', v: 'sqrt' }); i++; continue; }
      throw new Error(`Carácter no válido: "${ch}"`);
    }
    return tokens;
  }

  // Analizador descendente recursivo → árbol.
  function analizar(tokens) {
    let pos = 0;
    const mirar = () => tokens[pos];
    const tomar = () => tokens[pos++];
    const esOp = (v) => { const tk = mirar(); return tk && tk.t === 'op' && tk.v === v; };

    function expr() {
      let izq = term();
      while (esOp('+') || esOp('-')) {
        const op = tomar().v;
        izq = { k: 'bin', op, a: izq, b: term() };
      }
      return izq;
    }
    function term() {
      let izq = factor();
      for (;;) {
        if (esOp('*') || esOp('/') || esOp('%')) {
          const op = tomar().v;
          izq = { k: 'bin', op, a: izq, b: factor() };
          continue;
        }
        // Multiplicación implícita: 2v, 2(v+1), v t, 2 sin(x)
        const tk = mirar();
        if (tk && (tk.t === 'num' || tk.t === 'id' || (tk.t === 'op' && tk.v === '('))) {
          izq = { k: 'bin', op: '*', a: izq, b: factor() };
          continue;
        }
        return izq;
      }
    }
    function factor() {
      if (esOp('-')) { tomar(); return { k: 'neg', a: factor() }; }
      if (esOp('+')) { tomar(); return factor(); }
      return power();
    }
    function power() {
      const base = atom();
      if (esOp('^')) { tomar(); return { k: 'bin', op: '^', a: base, b: factor() }; }
      return base;
    }
    function atom() {
      const tk = tomar();
      if (!tk) throw new Error('La fórmula termina antes de tiempo');
      if (tk.t === 'num') return { k: 'num', v: tk.v };
      if (tk.t === 'id') {
        if (esOp('(')) {
          tomar();
          const args = [];
          if (!esOp(')')) {
            args.push(expr());
            while (esOp(',')) { tomar(); args.push(expr()); }
          }
          if (!esOp(')')) throw new Error(`Falta ")" tras ${tk.v}(`);
          tomar();
          return { k: 'fn', nombre: tk.v, args };
        }
        return { k: 'var', nombre: tk.v };
      }
      if (tk.t === 'op' && tk.v === '(') {
        const e = expr();
        if (!esOp(')')) throw new Error('Falta un paréntesis de cierre ")"');
        tomar();
        return e;
      }
      throw new Error(`No se esperaba "${tk.v}"`);
    }

    if (tokens.length === 0) throw new Error('Fórmula vacía');
    const arbol = expr();
    if (pos < tokens.length) throw new Error(`No se esperaba "${tokens[pos].v}"`);
    return arbol;
  }

  function evaluar(nodo, vars) {
    switch (nodo.k) {
      case 'num': return nodo.v;
      case 'var': {
        if (Object.prototype.hasOwnProperty.call(vars, nodo.nombre)) return vars[nodo.nombre];
        if (Object.prototype.hasOwnProperty.call(CONSTANTES, nodo.nombre)) return CONSTANTES[nodo.nombre];
        if (Object.prototype.hasOwnProperty.call(FUNCIONES, nodo.nombre)) throw new Error(`${nodo.nombre} es una función: escribe ${nodo.nombre}(…)`);
        throw new Error(`Variable desconocida: ${nodo.nombre}`);
      }
      case 'neg': return -evaluar(nodo.a, vars);
      case 'bin': {
        const a = evaluar(nodo.a, vars), b = evaluar(nodo.b, vars);
        switch (nodo.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': if (b === 0) throw new Error('División por cero'); return a / b;
          case '%': return a % b;
          case '^': return Math.pow(a, b);
        }
        throw new Error('Operador desconocido');
      }
      case 'fn': {
        const f = FUNCIONES[nodo.nombre];
        if (!f) throw new Error(`Función desconocida: ${nodo.nombre}`);
        return f.apply(null, nodo.args.map((x) => evaluar(x, vars)));
      }
    }
    throw new Error('Expresión no válida');
  }

  // Variables numéricas del set (los textos se ignoran en las fórmulas).
  function variablesNumericas(set) {
    const vars = {};
    for (const k in (set || {})) {
      const n = normalizarNumero(set[k]);
      if (!isNaN(n)) vars[k] = n;
    }
    return vars;
  }

  const cacheArboles = new Map();
  function arbolDe(expresion) {
    const clave = String(expresion || '').trim();
    let arbol = cacheArboles.get(clave);
    if (!arbol) {
      arbol = analizar(tokenizar(clave));
      if (cacheArboles.size > 500) cacheArboles.clear();
      cacheArboles.set(clave, arbol);
    }
    return arbol;
  }

  // → { valor: number|null, error: string|null }
  function calcular(expresion, set) {
    try {
      const v = evaluar(arbolDe(expresion), variablesNumericas(set));
      if (typeof v !== 'number' || isNaN(v)) return { valor: null, error: 'El resultado no es un número' };
      if (!isFinite(v)) return { valor: null, error: 'Resultado infinito' };
      return { valor: v, error: null };
    } catch (e) {
      return { valor: null, error: e.message || String(e) };
    }
  }

  // Nombres de variable que usa una fórmula (sin funciones ni constantes).
  function variablesUsadas(expresion) {
    const nombres = new Set();
    try {
      (function rec(n) {
        if (!n) return;
        if (n.k === 'var') nombres.add(n.nombre);
        if (n.k === 'fn') n.args.forEach(rec);
        if (n.a) rec(n.a);
        if (n.b) rec(n.b);
      })(arbolDe(expresion));
    } catch (_) { /* fórmula inválida: sin variables */ }
    return Array.from(nombres).filter((n) => !(n in CONSTANTES));
  }

  return {
    calcular,
    variablesUsadas,
    variablesNumericas,
    FUNCIONES: Object.keys(FUNCIONES),
    CONSTANTES: Object.assign({}, CONSTANTES),
  };
})();
