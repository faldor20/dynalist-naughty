{
  inputs = {
    nixpkgs.url = "nixpkgs"; # also valid: "nixpkgs"
  };

  # Flake outputs
  outputs = { self, nixpkgs,... }@inputs:
    let
      # Systems supported
      allSystems = [
        "x86_64-linux" # 64-bit Intel/AMD Linux
      ];

      # Helper to provide system-specific attributes
      forAllSystems = f: nixpkgs.lib.genAttrs allSystems (system: f {
        pkgs = import nixpkgs { inherit system;
        config.allowUnfree=true;
        config.allowInsecrue=true;
         };

      });
    in
    {
    packages= forAllSystems ({ pkgs }: 
    let 

      fs = nixpkgs.lib.fileset;
      sourceFiles = fs.gitTracked ./.;
      in
    {

        default=pkgs.stdenv.mkDerivation rec {

      src=./.;
      pname = "dynalist";
      version = "1.0.6-custom";

      dontUnpack = true;
      dontConfigure = true;
      dontBuild = true;
      buildInputs=[pkgs.makeWrapper];
      ## I need to find out how to get all my local files into the build
      installPhase = ''
       runHook preInstall

       mkdir -p $out/bin
       makeWrapper ${pkgs.electron_11}/bin/electron $out/bin/dynalist --add-flags $out/share/dynalist/app.asar --add-flags --no-sandbox	

       install -m 444 -D $src/resources/app.asar $out/share/dynalist/app.asar
       install -m 444 -D $src/resources/dynalist.asar $out/share/dynalist/dynalist.asar
       runHook postInstall
      '';

      };
    });

};
}
