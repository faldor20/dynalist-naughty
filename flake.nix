
{ lib, stdenv, fetchurl, appimageTools, makeDesktopItem,electron_11 }:

stdenv.mkDerivation (finalAttrs: let
  inherit (finalAttrs) pname ;

in
{
  pname = "dynalist";
  version = "1.0.6-custom";

  dontUnpack = true;
  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

   mkdir -p $out/bin
    makeWrapper ${electron_11}/bin/electron $out/bin/dynalist \
        --add-flags $out/resources/app.asar \	

      install -m 444 -D resources/app.asar $out/share/dynalist/app.asar
      install -m 444 -D resources/dynalist.asar $out/share/dynalist/dynalist.asar
      runHook postInstall
  '';

  meta = with lib; {
    description = "dynalist  custom";
    homepage = "";
    maintainers = with maintainers; [ max-niederman jgarcia ];
    license = licenses.unfree;
    platforms = [ "x86_64-linux" ];
    mainProgram = "dynalist";
  };
})
