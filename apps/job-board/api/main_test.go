package main

import (
	"strings"
	"testing"
)

func envOf(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func serveEnv(over map[string]string) map[string]string {
	m := map[string]string{
		"DATABASE_URL": "postgres://bt_gateway@db/x", "PUBLIC_ORIGIN": "https://crew.boromtech.com", "EDGE_KEY": "k",
		"GOOGLE_CLIENT_ID": "id", "GOOGLE_CLIENT_SECRET": "s",
		"R2_ACCOUNT_ID": "acct", "R2_ACCESS_KEY_ID": "ak", "R2_SECRET_ACCESS_KEY": "sk",
	}
	for k, v := range over {
		m[k] = v
	}
	return m
}

func TestConfig(t *testing.T) {
	c, err := loadConfig("serve", envOf(serveEnv(nil)))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8080" || c.R2.Endpoint != "https://acct.r2.cloudflarestorage.com" || c.R2.Region != "auto" || c.R2.Bucket != "bt-crew-files" {
		t.Fatalf("defaults: %+v", c)
	}
	for name, c := range map[string]struct {
		mode string
		env  map[string]string
		err  string // "" = must load
	}{
		"https without edge key":       {"serve", serveEnv(map[string]string{"EDGE_KEY": ""}), "EDGE_KEY"},
		"localhost without edge key":   {"serve", serveEnv(map[string]string{"EDGE_KEY": "", "PUBLIC_ORIGIN": "http://localhost:5173"}), ""},
		"lookalike host, no edge key":  {"serve", serveEnv(map[string]string{"EDGE_KEY": "", "PUBLIC_ORIGIN": "http://localhost.evil.example"}), "EDGE_KEY"},
		"origin with a path":           {"serve", serveEnv(map[string]string{"PUBLIC_ORIGIN": "https://crew.boromtech.com/"}), "PUBLIC_ORIGIN"},
		"no google secret":             {"serve", serveEnv(map[string]string{"GOOGLE_CLIENT_SECRET": ""}), "GOOGLE_CLIENT_SECRET"},
		"no R2 endpoint":               {"serve", serveEnv(map[string]string{"R2_ACCOUNT_ID": ""}), "R2_ACCOUNT_ID"},
		"R2_ENDPOINT instead":          {"serve", serveEnv(map[string]string{"R2_ACCOUNT_ID": "", "R2_ENDPOINT": "http://localhost:59000"}), ""},
		"sweep needs only its own url": {"sweep", map[string]string{"SWEEPER_DATABASE_URL": "postgres://bt_sweeper@db/x", "R2_ACCOUNT_ID": "a", "R2_ACCESS_KEY_ID": "ak", "R2_SECRET_ACCESS_KEY": "sk"}, ""},
		"sweep without its url":        {"sweep", serveEnv(nil), "SWEEPER_DATABASE_URL"},
		"unknown command":              {"migrate", serveEnv(nil), "unknown command"},
	} {
		_, err := loadConfig(c.mode, envOf(c.env))
		if (c.err == "") != (err == nil) || (err != nil && !strings.Contains(err.Error(), c.err)) {
			t.Errorf("%s: %v", name, err)
		}
	}
}
