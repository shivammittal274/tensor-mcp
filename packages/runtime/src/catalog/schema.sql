CREATE TABLE IF NOT EXISTS tools (
  service TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  input_schema_json TEXT NOT NULL DEFAULT '{}',
  version_hash TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  PRIMARY KEY (service, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_tools_service ON tools(service);
CREATE INDEX IF NOT EXISTS idx_tools_indexed_at ON tools(indexed_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
