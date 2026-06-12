//go:build ignore

// analyze_kehadiran_2025.go — quick structural + content audit of the
// 2025 attendance xlsx so we know which sheet to import and whether the
// column layout differs from 2024.
package main

import (
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/xuri/excelize/v2"
)

const inputPath = "excel/Kegiatan Pengajian PPG US 2025.xlsx"

func main() {
	f, err := excelize.OpenFile(inputPath)
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer f.Close()
	sheets := f.GetSheetList()
	fmt.Printf("sheets (%d):\n", len(sheets))
	for _, s := range sheets {
		rows, _ := f.GetRows(s)
		fmt.Printf("  %q  rows=%d\n", s, len(rows))
	}

	// Inspect each non-empty sheet's header + a couple sample rows + value
	// summaries for guru/murid/status/materi columns.
	for _, s := range sheets {
		rows, err := f.GetRows(s)
		if err != nil || len(rows) < 2 {
			continue
		}
		fmt.Printf("\n=== sheet %q ===\n", s)
		header := rows[0]
		fmt.Printf("header (%d cols):\n", len(header))
		for i, h := range header {
			fmt.Printf("  [%2d] %q\n", i, h)
		}
		fmt.Printf("sample row 1: %v\n", trimRow(rows[1]))
		if len(rows) >= 3 {
			fmt.Printf("sample row 2: %v\n", trimRow(rows[2]))
		}
		if len(rows) >= 5 {
			fmt.Printf("sample row 4: %v\n", trimRow(rows[4]))
		}

		colIdx := map[string]int{}
		for i, h := range header {
			colIdx[strings.ToUpper(strings.TrimSpace(strings.TrimSuffix(h, ":")))] = i
		}
		count := func(name string) (int, map[string]int) {
			i, ok := colIdx[name]
			if !ok {
				return -1, nil
			}
			m := map[string]int{}
			for _, r := range rows[1:] {
				if i >= len(r) {
					continue
				}
				v := strings.TrimSpace(r[i])
				if v == "" {
					continue
				}
				m[v]++
			}
			return len(m), m
		}
		for _, col := range []string{"TANGGAL", "NAMA GURU", "NAMA MURID", "KEHADIRAN", "MATERI", "DURASI"} {
			n, m := count(col)
			if n < 0 {
				fmt.Printf("  %s: column missing\n", col)
				continue
			}
			fmt.Printf("  %s: %d distinct values\n", col, n)
			if col == "KEHADIRAN" || col == "NAMA GURU" {
				type kv struct {
					k string
					v int
				}
				list := make([]kv, 0, len(m))
				for k, v := range m {
					list = append(list, kv{k, v})
				}
				sort.Slice(list, func(i, j int) bool { return list[i].v > list[j].v })
				for i, e := range list {
					if i >= 20 {
						fmt.Printf("    … (+%d more)\n", len(list)-i)
						break
					}
					fmt.Printf("    %q: %d\n", e.k, e.v)
				}
			}
		}
	}
}

func trimRow(r []string) []string {
	out := make([]string, len(r))
	for i, v := range r {
		v = strings.TrimSpace(v)
		if len(v) > 40 {
			v = v[:37] + "…"
		}
		out[i] = v
	}
	return out
}
