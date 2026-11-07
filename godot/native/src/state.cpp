// src/war/sim/state.ts encodeGraph / decodeGraph over the C++ graph (state.h), and the JSON text of a save.
#include "state.h"

#include <cmath>
#include <limits>
#include <map>
#include <unordered_set>

#include "js_math.h"

namespace sim::state {

static const char *TA_NAMES[] = { "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array" };
static const int TA_SIZES[] = { 1, 1, 1, 2, 2, 4, 4, 4, 8 };

const char *ta_name(TA t) { return TA_NAMES[int(t)]; }
int ta_size(TA t) { return TA_SIZES[int(t)]; }
bool ta_of(const std::string &name, TA &out) {
	for (int i = 0; i < 9; i++)
		if (name == TA_NAMES[i]) {
			out = TA(i);
			return true;
		}
	return false;
}

static const Val UNDEF;

const Val &Obj::get(const char *key) const {
	for (size_t i = 0; i < keys.size(); i++)
		if (keys[i] == key) return vals[i];
	return UNDEF;
}

bool Obj::has(const char *key) const {
	for (auto &k : keys)
		if (k == key) return true;
	return false;
}

double Obj::elem(size_t j) const {
	const uint8_t *p = bytes.data() + j * ta_size(ta);
	switch (ta) {
		case TA::Int8: return double(int8_t(*p));
		case TA::Uint8:
		case TA::Uint8Clamped: return double(*p);
		case TA::Int16: { int16_t v; std::memcpy(&v, p, 2); return v; }
		case TA::Uint16: { uint16_t v; std::memcpy(&v, p, 2); return v; }
		case TA::Int32: { int32_t v; std::memcpy(&v, p, 4); return v; }
		case TA::Uint32: { uint32_t v; std::memcpy(&v, p, 4); return v; }
		case TA::Float32: { float v; std::memcpy(&v, p, 4); return double(v); }
		case TA::Float64: { double v; std::memcpy(&v, p, 8); return v; }
	}
	return 0;
}

Obj *Graph::typed(TA t, const void *data, size_t n, size_t elemSize) {
	Obj *o = make('t');
	o->ta = t;
	o->length = n;
	// the C++ arrays hold the TS element width (an Int8Array may sit in a uint8_t vector: the same bytes)
	o->bytes.assign(static_cast<const uint8_t *>(data), static_cast<const uint8_t *>(data) + n * elemSize);
	return o;
}

// ---- JSON text ----

void json_string(std::string &out, const std::string &s) {
	static const char *HEX = "0123456789abcdef";
	out += '"';
	for (unsigned char c : s) {
		switch (c) {
			case '"': out += "\\\""; break;
			case '\\': out += "\\\\"; break;
			case '\b': out += "\\b"; break;
			case '\f': out += "\\f"; break;
			case '\n': out += "\\n"; break;
			case '\r': out += "\\r"; break;
			case '\t': out += "\\t"; break;
			default:
				if (c < 0x20) {
					out += "\\u00";
					out += HEX[c >> 4];
					out += HEX[c & 15];
				} else out += char(c);
		}
	}
	out += '"';
}

static void json_number(std::string &out, double v) {
	// encodeGraph tags what JSON cannot hold: -0, NaN and the infinities
	if (!std::isfinite(v) || (v == 0 && std::signbit(v))) {
		out += "{\"$\":\"n\",\"v\":\"";
		out += v == 0 ? "-0" : js::number_to_string(v);
		out += "\"}";
	} else out += js::number_to_string(v);
}

static std::string b64(const std::vector<uint8_t> &u) {
	static const char *A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	std::string s;
	s.reserve((u.size() + 2) / 3 * 4);
	size_t i = 0;
	for (; i + 2 < u.size(); i += 3) {
		const uint32_t v = (u[i] << 16) | (u[i + 1] << 8) | u[i + 2];
		s += A[v >> 18];
		s += A[(v >> 12) & 63];
		s += A[(v >> 6) & 63];
		s += A[v & 63];
	}
	if (i + 1 == u.size()) {
		const uint32_t v = u[i] << 16;
		s += A[v >> 18];
		s += A[(v >> 12) & 63];
		s += "==";
	} else if (i + 2 == u.size()) {
		const uint32_t v = (u[i] << 16) | (u[i + 1] << 8);
		s += A[v >> 18];
		s += A[(v >> 12) & 63];
		s += A[(v >> 6) & 63];
		s += '=';
	}
	return s;
}

static std::vector<uint8_t> unb64(const std::string &s) {
	std::vector<uint8_t> out;
	out.reserve(s.size() / 4 * 3);
	uint32_t acc = 0;
	int bits = 0;
	for (char c : s) {
		int v;
		if (c >= 'A' && c <= 'Z') v = c - 'A';
		else if (c >= 'a' && c <= 'z') v = c - 'a' + 26;
		else if (c >= '0' && c <= '9') v = c - '0' + 52;
		else if (c == '+') v = 62;
		else if (c == '/') v = 63;
		else continue;
		acc = (acc << 6) | uint32_t(v);
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out.push_back(uint8_t((acc >> bits) & 0xff));
		}
	}
	return out;
}

// ---- encodeGraph ----

// pairTyped: each typed array of cur with the same-typed, same-length one at the same place in base, following only
// object properties and Map values
static void pair_typed(Obj *cur, Obj *base, std::unordered_map<Obj *, Obj *> &out, std::unordered_set<Obj *> &seen) {
	if (!cur || !base || seen.count(cur)) return;
	seen.insert(cur);
	if (cur->kind == 't') {
		if (base->kind == 't' && base->ta == cur->ta && base->length == cur->length) out[cur] = base;
		return;
	}
	auto obj = [](const Val &v) { return v.k == Val::Ref ? v.o : nullptr; };
	if (cur->kind == 'm' && base->kind == 'm') {
		for (size_t j = 0; j + 1 < cur->vals.size(); j += 2) {
			const Val &k = cur->vals[j];
			Obj *b = nullptr;
			if (k.k == Val::Num || k.k == Val::Str || k.k == Val::Bool) // base.get(k): primitive keys by value
				for (size_t i = 0; i + 1 < base->vals.size(); i += 2) {
					const Val &bk = base->vals[i];
					if (bk.k == k.k && (k.k == Val::Num ? bk.n == k.n : k.k == Val::Str ? bk.s == k.s : bk.b == k.b)) {
						b = obj(base->vals[i + 1]);
						break;
					}
				}
			pair_typed(obj(cur->vals[j + 1]), b, out, seen);
		}
	} else if (cur->kind == 'o' || cur->kind == 'c') {
		if (base->kind != 'o' && base->kind != 'c') return; // a base array, Map or Set: its named props are undefined
		for (size_t j = 0; j < cur->keys.size(); j++) pair_typed(obj(cur->vals[j]), obj(base->get(cur->keys[j].c_str())), out, seen);
	}
}

std::string encode(const Val &root, Obj *base, const std::string &region, uint32_t seed, bool head) {
	std::unordered_map<Obj *, int> ids;
	std::vector<Obj *> todo;
	std::vector<const std::vector<std::string> *> shapes;
	std::map<std::string, std::vector<int>> shapeIx;
	std::unordered_map<Obj *, Obj *> baseOf;
	if (base && root.k == Val::Ref) {
		std::unordered_set<Obj *> seen;
		pair_typed(root.o, base, baseOf, seen);
	}
	std::string out;
	out.reserve(1 << 20);
	auto val = [&](std::string &w, const Val &v) {
		switch (v.k) {
			case Val::Num: json_number(w, v.n); break;
			case Val::Str: json_string(w, v.s); break;
			case Val::Bool: w += v.b ? "true" : "false"; break;
			case Val::Undef: w += "{\"$\":\"u\"}"; break;
			case Val::Null: w += "null"; break;
			case Val::Ext:
				w += "{\"$\":\"x\",\"k\":";
				json_string(w, v.s);
				w += '}';
				break;
			case Val::Ref: {
				auto it = ids.find(v.o);
				int i;
				if (it == ids.end()) {
					i = int(todo.size());
					ids.emplace(v.o, i);
					todo.push_back(v.o);
				} else i = it->second;
				w += "{\"$\":\"r\",\"i\":";
				w += std::to_string(i);
				w += '}';
				break;
			}
		}
	};
	auto list = [&](std::string &w, const std::vector<Val> &vs) {
		w += '[';
		for (size_t j = 0; j < vs.size(); j++) {
			if (j) w += ',';
			val(w, vs[j]);
		}
		w += ']';
	};
	std::string top;
	val(top, root);
	std::string objs = "[";
	for (size_t k = 0; k < todo.size(); k++) {
		Obj *o = todo[k];
		if (k) objs += ',';
		switch (o->kind) {
			case 'a':
				objs += "[\"a\",";
				list(objs, o->vals);
				objs += ']';
				break;
			case 'm':
				objs += "[\"m\",";
				list(objs, o->vals);
				objs += ']';
				break;
			case 's':
				objs += "[\"s\",";
				list(objs, o->vals);
				objs += ']';
				break;
			case 't': {
				auto bi = baseOf.find(o);
				const Obj *b = bi == baseOf.end() ? nullptr : bi->second;
				const int size = ta_size(o->ta);
				const double cap = double(o->length) / 4;
				std::vector<size_t> diff;
				for (size_t j = 0; j < o->length && double(diff.size() * 2) < cap; j++) {
					const uint8_t *p = o->bytes.data() + j * size;
					bool same = true;
					for (int q = 0; q < size && same; q++) same = p[q] == (b ? b->bytes[j * size + q] : 0);
					if (!same) diff.push_back(j);
				}
				if (double(diff.size() * 2) < cap) {
					objs += b ? "[\"d\",\"" : "[\"z\",\"";
					objs += ta_name(o->ta);
					objs += "\",";
					objs += std::to_string(o->length);
					objs += ",[";
					for (size_t j = 0; j < diff.size(); j++) {
						if (j) objs += ',';
						objs += std::to_string(diff[j]);
						objs += ',';
						json_number(objs, o->elem(diff[j]));
					}
					objs += "]]";
				} else {
					objs += "[\"t\",\"";
					objs += ta_name(o->ta);
					objs += "\",\"";
					objs += b64(o->bytes);
					objs += "\",";
					objs += std::to_string(o->length);
					objs += ']';
				}
				break;
			}
			default: { // 'o', 'c'
				const auto &keys = o->keys;
				std::string cand = std::to_string(keys.size()) + "|" + (keys.empty() ? "undefined" : keys[0]) + "|" + (keys.empty() ? "undefined" : keys.back());
				auto &cands = shapeIx[cand];
				int s = -1;
				for (int x : cands)
					if (*shapes[x] == keys) {
						s = x;
						break;
					}
				if (s < 0) {
					s = int(shapes.size());
					shapes.push_back(&o->keys);
					cands.push_back(s);
				}
				objs += o->kind == 'o' ? "[\"o\"," : "[\"c\",";
				objs += std::to_string(s);
				objs += ',';
				list(objs, o->vals);
				if (o->kind == 'c') {
					objs += ',';
					json_string(objs, o->name);
				}
				objs += ']';
			}
		}
	}
	objs += ']';
	if (head) {
		out += "{\"v\":" + std::to_string(STATE_VERSION) + ",\"region\":";
		json_string(out, region);
		out += ",\"seed\":";
		out += js::number_to_string(seed);
		out += ",\"shapes\":[";
	} else out += "{\"shapes\":[";
	for (size_t i = 0; i < shapes.size(); i++) {
		if (i) out += ',';
		out += '[';
		for (size_t j = 0; j < shapes[i]->size(); j++) {
			if (j) out += ',';
			json_string(out, (*shapes[i])[j]);
		}
		out += ']';
	}
	out += "],\"objs\":";
	out += objs;
	out += ",\"root\":";
	out += top;
	out += '}';
	return out;
}

// ---- JSON parse and decodeGraph ----

namespace {

struct J {
	enum T : uint8_t { Null, Bool, Num, Str, Arr, Obj } t = Null;
	bool b = false;
	double n = 0;
	std::string s;
	std::vector<J> a;
	std::vector<std::pair<std::string, J>> o;
	const J *get(const char *k) const {
		for (auto &kv : o)
			if (kv.first == k) return &kv.second;
		return nullptr;
	}
};

struct Parser {
	const char *p, *end;
	bool failed = false;
	// no exceptions in the extension: a malformed text stops the parse (p at the end) and is reported by decode
	void bad() {
		failed = true;
		p = end;
	}
	char peek() const { return p < end ? *p : 0; }
	char take() { return p < end ? *p++ : 0; }
	void ws() {
		while (p < end && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t')) p++;
	}
	static void utf8(std::string &s, uint32_t c) {
		if (c < 0x80) s += char(c);
		else if (c < 0x800) s += char(0xc0 | (c >> 6)), s += char(0x80 | (c & 63));
		else if (c < 0x10000) s += char(0xe0 | (c >> 12)), s += char(0x80 | ((c >> 6) & 63)), s += char(0x80 | (c & 63));
		else s += char(0xf0 | (c >> 18)), s += char(0x80 | ((c >> 12) & 63)), s += char(0x80 | ((c >> 6) & 63)), s += char(0x80 | (c & 63));
	}
	uint32_t hex4() {
		if (end - p < 4) return bad(), 0u;
		uint32_t v = 0;
		for (int i = 0; i < 4; i++) {
			const char c = *p++;
			v <<= 4;
			if (c >= '0' && c <= '9') v |= c - '0';
			else if (c >= 'a' && c <= 'f') v |= c - 'a' + 10;
			else if (c >= 'A' && c <= 'F') v |= c - 'A' + 10;
			else return bad(), 0u;
		}
		return v;
	}
	std::string str() {
		if (take() != '"') return bad(), std::string();
		std::string s;
		while (p < end && *p != '"') {
			if (*p != '\\') {
				s += *p++;
				continue;
			}
			p++;
			const char c = take();
			switch (c) {
				case '"': s += '"'; break;
				case '\\': s += '\\'; break;
				case '/': s += '/'; break;
				case 'b': s += '\b'; break;
				case 'f': s += '\f'; break;
				case 'n': s += '\n'; break;
				case 'r': s += '\r'; break;
				case 't': s += '\t'; break;
				case 'u': {
					uint32_t u = hex4();
					if (u >= 0xd800 && u < 0xdc00 && end - p >= 6 && p[0] == '\\' && p[1] == 'u') {
						p += 2;
						const uint32_t lo = hex4();
						u = 0x10000 + ((u - 0xd800) << 10) + (lo - 0xdc00);
					}
					utf8(s, u);
					break;
				}
				default: return bad(), std::string();
			}
		}
		if (take() != '"') bad();
		return s;
	}
	void value(J &j) {
		ws();
		if (p >= end) return bad();
		const char c = *p;
		if (c == '{') {
			j.t = J::Obj;
			p++;
			ws();
			if (peek() == '}') return void(p++);
			while (!failed) {
				ws();
				std::string k = str();
				ws();
				if (take() != ':') return bad();
				j.o.emplace_back(std::move(k), J());
				value(j.o.back().second);
				ws();
				const char n = take();
				if (n == ',') continue;
				if (n != '}') bad();
				return;
			}
			return;
		}
		if (c == '[') {
			j.t = J::Arr;
			p++;
			ws();
			if (peek() == ']') return void(p++);
			while (!failed) {
				j.a.emplace_back();
				value(j.a.back());
				ws();
				const char n = take();
				if (n == ',') continue;
				if (n != ']') bad();
				return;
			}
			return;
		}
		if (c == '"') {
			j.t = J::Str;
			j.s = str();
			return;
		}
		if (end - p >= 4 && !std::strncmp(p, "true", 4)) return void((j.t = J::Bool, j.b = true, p += 4));
		if (end - p >= 5 && !std::strncmp(p, "false", 5)) return void((j.t = J::Bool, j.b = false, p += 5));
		if (end - p >= 4 && !std::strncmp(p, "null", 4)) return void((j.t = J::Null, p += 4));
		char *e;
		j.t = J::Num;
		j.n = std::strtod(p, &e); // correctly rounded: V8's shortest digits read back exactly
		if (e == p) return bad();
		p = e;
	}
};

double tagNum(const std::string &v) {
	if (v == "-0") return -0.0;
	if (v == "NaN") return std::numeric_limits<double>::quiet_NaN();
	if (v == "Infinity") return std::numeric_limits<double>::infinity();
	if (v == "-Infinity") return -std::numeric_limits<double>::infinity();
	return std::strtod(v.c_str(), nullptr);
}

} // namespace

bool decode(const std::string &text, Decoded &out, bool head) {
	J doc;
	Parser ps{ text.data(), text.data() + text.size() };
	ps.value(doc);
	if (ps.failed || doc.t != J::Obj) return false;
	const J *v = doc.get("v"), *region = doc.get("region"), *seed = doc.get("seed"), *shapes = doc.get("shapes"), *objs = doc.get("objs"), *root = doc.get("root");
	if ((head && (!v || !region || !seed)) || !shapes || !objs || !root || objs->t != J::Arr || shapes->t != J::Arr) return false;
	if (head) {
		out.v = int(v->n);
		out.region = region->s;
		out.seed = seed->n;
	}
	std::vector<Obj *> made;
	made.reserve(objs->a.size());
	for (auto &e : objs->a) {
		if (e.t != J::Arr || e.a.size() < 2 || e.a[0].t != J::Str || e.a[0].s.empty()) return false;
		const char k = e.a[0].s[0];
		made.push_back(out.g.make(k == 'd' || k == 'z' ? 't' : k));
		if (k == 'd' || k == 'z') made.back()->form = k;
	}
	bool ok = true;
	auto toVal = [&](const J &j) -> Val {
		switch (j.t) {
			case J::Null: return Val::null();
			case J::Bool: return Val(j.b);
			case J::Num: return Val(j.n);
			case J::Str: return Val(j.s);
			case J::Obj: {
				const J *t = j.get("$");
				if (!t) break;
				if (t->s == "r") {
					const J *i = j.get("i");
					if (!i || i->n < 0 || size_t(i->n) >= made.size()) break;
					return Val(made[size_t(i->n)]);
				}
				const J *x = j.get(t->s == "x" ? "k" : "v");
				if (t->s == "x" && x) return Val::ext(x->s);
				if (t->s == "n" && x) return Val(tagNum(x->s));
				if (t->s == "u") return Val();
				break;
			}
			default: break;
		}
		ok = false;
		return Val();
	};
	for (size_t i = 0; i < made.size() && ok; i++) {
		const J &e = objs->a[i];
		Obj *o = made[i];
		const char k = e.a[0].s[0];
		const size_t n = e.a.size();
		switch (k) {
			case 'a':
			case 'm':
			case 's':
				if (e.a[1].t != J::Arr) return false;
				o->vals.reserve(e.a[1].a.size());
				for (auto &x : e.a[1].a) o->vals.push_back(toVal(x));
				break;
			case 'o':
			case 'c': {
				if (n < 3 || e.a[1].t != J::Num || e.a[1].n < 0 || size_t(e.a[1].n) >= shapes->a.size() || e.a[2].t != J::Arr) return false;
				const J &sh = shapes->a[size_t(e.a[1].n)];
				if (sh.a.size() != e.a[2].a.size()) return false;
				for (size_t q = 0; q < sh.a.size(); q++) o->set(sh.a[q].s.c_str(), toVal(e.a[2].a[q]));
				if (k == 'c') {
					if (n < 4) return false;
					o->name = e.a[3].s;
				}
				break;
			}
			case 't':
				if (n < 4 || !ta_of(e.a[1].s, o->ta)) return false;
				o->bytes = unb64(e.a[2].s);
				o->length = size_t(e.a[3].n);
				if (o->bytes.size() != o->length * ta_size(o->ta)) return false;
				break;
			case 'd':
			case 'z': {
				if (n < 4 || !ta_of(e.a[1].s, o->ta) || e.a[3].t != J::Arr) return false;
				o->length = size_t(e.a[2].n);
				const auto &d = e.a[3].a;
				for (size_t q = 0; q + 1 < d.size(); q += 2) {
					if (d[q].n < 0 || size_t(d[q].n) >= o->length) return false;
					o->diff.emplace_back(size_t(d[q].n), toVal(d[q + 1]).n);
				}
				break;
			}
			default: return false;
		}
	}
	out.root = toVal(*root);
	return ok;
}

} // namespace sim::state
