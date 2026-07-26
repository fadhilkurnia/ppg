package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStudentsParseAllowsOtherKelompok(t *testing.T) {
	h := NewStudents(nil)
	req := httptest.NewRequest("POST", "/students", strings.NewReader(`{
		"name":"Dihyah",
		"nickname":"Dihyah",
		"gender":"female",
		"level":"Caberawit",
		"kelompok":"Other",
		"status":"active"
	}`))

	in, err := h.parse(req)
	if err != nil {
		t.Fatalf("parse Other kelompok: %v", err)
	}
	if in.Kelompok != "Other" {
		t.Errorf("Kelompok = %q, want Other", in.Kelompok)
	}
}
