// Mepto Go orchestrator — proxies to Mimber's mimber (or fork's mimber)
package main

import (
	"os"
	"os/exec"
	"path/filepath"
)

func main() {
	// try Mimber sibling, then vendor/themekit
	candidates := []string{
		filepath.Join("..", "Mimber", "vendor", "themekit", "cmd", "mimber"),
		filepath.Join("vendor", "themekit", "cmd", "mimber"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			args := append([]string{"run", c}, os.Args[1:]...)
			cmd := exec.Command("go", args...)
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			cmd.Stdin = os.Stdin
			if err := cmd.Run(); err == nil {
				os.Exit(0)
			}
		}
	}
	os.Stderr.WriteString("mimber: no vendored fork found (vendor/themekit/cmd/mimber) — see Mimber\n")
	os.Exit(1)
}
