export NIXPKGS_ALLOW_INSECURE=1
full_path=$(dirname $(realpath $0))
nix-shell -p electron_11 --command "electron $full_path/resources/app.asar"


