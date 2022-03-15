{ zig, stdenvNoCC }:

stdenvNoCC.mkDerivation {
  pname = "wisp";
  version = "0.7.5";
  src = ./.;

  nativeBuildInputs = [zig];

  XDG_CACHE_HOME = ".cache";

  buildPhase = "zig build";
  testPhase = "zig build test";

  installPhase = ''
    mkdir -p $out/{bin,lib}
    cp zig-out/bin/* $out/bin/
    cp zig-out/lib/* $out/lib/
  '';
}
