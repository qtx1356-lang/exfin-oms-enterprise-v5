class Foo {}
const f = new Foo();
const p = new Proxy(f, {});
console.log(p instanceof Foo);
