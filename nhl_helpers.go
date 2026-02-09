package main

// interfaceSlice converts a []string to []interface{} for redis calls
func interfaceSlice(s []string) []interface{} {
	out := make([]interface{}, len(s))
	for i := range s {
		out[i] = s[i]
	}
	return out
}
