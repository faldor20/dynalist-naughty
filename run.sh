export NIXPKGS_ALLOW_INSECURE=1
nix-shell -p electron_11 --command "electron ./resources/app.asar"


