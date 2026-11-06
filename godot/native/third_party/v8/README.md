# V8 math (vendored)

`src/base/ieee754.{h,cc}` are copied unchanged from V8 14.1.146.11 (the V8 in Node 25; Node 22's V8 12.4 has the same
math). They are V8's fdlibm ports behind `Math.sin`, `cos`, `tan`, `atan2` and `log2` (`pow` and `**` use std::pow, as V8 does by
default: src/js_math.h), so the C++ sim gets
the same doubles as the TS sim (godot/native/src/js_math.h). Node does not build V8 with `V8_USE_LIBM_TRIG_FUNCTIONS`,
so `sin`/`cos` are the fdlibm ones too. The other headers in `src/base/` are small shims for what the file includes.
Licenses: LICENSE.v8 (BSD), LICENSE.fdlibm (Sun).
