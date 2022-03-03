type Tag =
  "int" | "sys" | "chr" | "fop" | "mop" |
  "duo" | "sym" | "fun" | "mac" | "v32" | "v08" | "pkg" |
  "ct0" | "ct1" | "ct2" | "ct3"

type Sys = "t" | "nil" | "nah" | "zap" | "top"

export interface WispAPI {
  memory: WebAssembly.Memory

  wisp_tag_int: WebAssembly.Global
  wisp_tag_sys: WebAssembly.Global
  wisp_tag_chr: WebAssembly.Global
  wisp_tag_fop: WebAssembly.Global
  wisp_tag_mop: WebAssembly.Global
  wisp_tag_duo: WebAssembly.Global
  wisp_tag_sym: WebAssembly.Global
  wisp_tag_fun: WebAssembly.Global
  wisp_tag_mac: WebAssembly.Global
  wisp_tag_v32: WebAssembly.Global
  wisp_tag_v08: WebAssembly.Global
  wisp_tag_pkg: WebAssembly.Global
  wisp_tag_ct0: WebAssembly.Global
  wisp_tag_ct1: WebAssembly.Global
  wisp_tag_ct2: WebAssembly.Global
  wisp_tag_ct3: WebAssembly.Global

  wisp_sys_t: WebAssembly.Global
  wisp_sys_nil: WebAssembly.Global
  wisp_sys_nah: WebAssembly.Global
  wisp_sys_zap: WebAssembly.Global
  wisp_sys_top: WebAssembly.Global

  wisp_alloc(ctx: number, n: number): number
  wisp_free(ctx: number, x: number): void
  wisp_destroy(ctx: number, x: number): void

  wisp_ctx_init(): number

  wisp_ctx_v08_len(ctx: number): number
  wisp_ctx_v08_ptr(ctx: number): number
  wisp_ctx_v32_len(ctx: number): number
  wisp_ctx_v32_ptr(ctx: number): number

  wisp_dat_init(ctx: number): number
  wisp_dat_read(ctx: number, dat: number): void

  wisp_read(ctx: number, buf: number): number
  wisp_eval(ctx: number, exp: number, max: number): number
}

export class CtxData {
  tab: Record<string, Record<string, number[]>>
  v08: ArrayBuffer
  v32: ArrayBuffer
  mem: WebAssembly.Memory

  constructor(
    public ctx: number,
    public api: WispAPI
  ) {
    this.mem = api.memory
    this.tab = this.readTab()
    this.v08 = this.readV08()
    this.v32 = this.readV32()
  }

  readV08() {
    const v08len = this.api.wisp_ctx_v08_len(this.ctx)
    const v08ptr = this.api.wisp_ctx_v08_ptr(this.ctx)
    return this.api.memory.buffer.slice(v08ptr, v08ptr + v08len)
  }

  readV32() {
    const v32len = this.api.wisp_ctx_v32_len(this.ctx)
    const v32ptr = this.api.wisp_ctx_v32_ptr(this.ctx)
    return this.api.memory.buffer.slice(v32ptr, v32ptr + 4 * v32len)
  }

  readTab() {
    const datptr = this.api.wisp_dat_init(this.ctx)
    this.api.wisp_dat_read(this.ctx, datptr)

    const tabs = {
      duo: ["car", "cdr"],
      sym: ["str", "pkg", "val", "fun"],
      fun: ["env", "par", "exp"],
      mac: ["env", "par", "exp"],
      v08: ["idx", "len"],
      v32: ["idx", "len"],
      pkg: ["nam", "sym"],
      ct0: ["env", "fun", "arg", "exp", "hop"],
      ct1: ["env", "yay", "nay"],
      ct2: ["env", "exp", "hop"],
      ct3: ["env", "exp", "dew", "arg", "hop"],
    }

    const n = Object.values(tabs).length
    const m = Object.values(tabs).reduce((n, cols) => n + cols.length, 0)

    const dat = new DataView(this.api.memory.buffer, datptr, 4 * (n + m))
    const mem = new DataView(this.api.memory.buffer)

    const u32 = (v: DataView, x: number) => v.getUint32(x, true)
    const u32s = (x: number, n: number): number[] => {
      const xs = []
      for (let i = 0; i < n; i++)
        xs[i] = u32(mem, x + 4 * i)
      return xs
    }

    let i = 0
    const next = () => u32(dat, 4 * i++)

    const tab: Record<string, Record<string, number[]>> = {}

    for (const [tag, cols] of Object.entries(tabs)) {
      tab[tag] = {}
      const n = next()
      for (const col of cols) {
        tab[tag][col] = u32s(next(), n)
      }
    }

    return tab
  }

  row(tag: Tag, x: number): Record<string, number> {
    const row: Record<string, number> = {}
    const tab = this.tab[tag]
    const i = idxOf(x)

    for (const [col, xs] of Object.entries(tab)) {
      row[col] = xs[i]
    }

    return row
  }

  str(x: number): string {
    const { idx, len } = this.row("v08", x)
    const buf = new Uint8Array(this.v08, idx, len)
    return new TextDecoder().decode(buf)
  }
}

export let TAG: Record<Tag, number> = undefined
export let SYS: Record<Sys, number> = undefined
export class Wisp {
  instance: WebAssembly.Instance
  api: WispAPI
  mem: DataView

  ctx: number

  constructor(wasm: WebAssembly.WebAssemblyInstantiatedSource) {
    this.instance = wasm.instance
    this.api = this.instance.exports as unknown as WispAPI
    this.mem = new DataView(this.api.memory.buffer)

    TAG = this.loadTags()
    SYS = this.loadSys()

    this.ctx = this.api.wisp_ctx_init()
  }

  loadTags(): Record<Tag, number> {
    const tag = (x: Tag) =>
      this.mem.getUint8(this.api[`wisp_tag_${x}`].value)

    return {
      int: tag("int"),
      sys: tag("sys"),
      chr: tag("chr"),
      fop: tag("fop"),
      mop: tag("mop"),
      duo: tag("duo"),
      sym: tag("sym"),
      fun: tag("fun"),
      mac: tag("mac"),
      v08: tag("v08"),
      v32: tag("v32"),
      pkg: tag("pkg"),
      ct0: tag("ct0"),
      ct1: tag("ct1"),
      ct2: tag("ct2"),
      ct3: tag("ct3"),
    }
  }

  loadSys(): Record<Sys, number> {
    const mem = new DataView(this.api.memory.buffer)
    const u32 = (x: number) => mem.getUint32(x, true)

    const sys = (x: Sys) =>
      u32(this.api[`wisp_sys_${x}`].value)

    return {
      t: sys("t"),
      nil: sys("nil"),
      nah: sys("nah"),
      zap: sys("zap"),
      top: sys("top")
    }
  }

  readData(): CtxData {
    return new CtxData(this.ctx, this.api)
  }

  read(sexp: string): number {
    const buf = this.api.wisp_alloc(this.ctx, sexp.length + 1)
    const arr = new TextEncoder().encode(sexp)
    const mem = new DataView(this.api.memory.buffer, buf, arr.length + 1)

    mem.setUint8(arr.length, 0)

    for (let i = 0; i < arr.length; i++) {
      mem.setUint8(i, arr[i])
    }

    const x = this.api.wisp_read(this.ctx, buf)
    this.api.wisp_free(this.ctx, buf)
    return x
  }

  eval(exp: number): number {
    return this.api.wisp_eval(this.ctx, exp, 10000)
  }
}

export function tagOf(x: number): Tag {
  const tagnum = x >>> (32 - 5)
  if (tagnum < 0b10000) 
    return "int"

  for (let [k, v] of Object.entries(TAG)) {
    if (v === tagnum)
      return k as Tag
  }

  throw new Error("weird tag")
}

export function idxOf(x: number): number {
  return ((x >>> 0) & 0b00000111111111111111111111111111) >>> 1
}