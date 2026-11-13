#!/usr/bin/env bash
# Installs the offline brain for the VitalOrbit assistant: Qwen2.5 1.5B Instruct (Q4_K_M, ~1.1 GB) into Ollama.
# Uses Hugging Face instead of ollama.com (blocked on some networks). Safe to re-run: the download resumes.
set -e
MODELS="$HOME/models"
FILE="qwen2.5-1.5b-instruct-q4_k_m.gguf"
URL="https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/$FILE"
mkdir -p "$MODELS" && cd "$MODELS"

echo ">>> Downloading $FILE (resumes if interrupted)"
until curl -L -C - --fail --retry 5 --retry-delay 3 -o "$FILE" "$URL"; do
  echo "    connection dropped, retrying in 5 s..."; sleep 5
done

cat > Modelfile <<'EOF'
FROM ./qwen2.5-1.5b-instruct-q4_k_m.gguf
TEMPLATE """{{- range .Messages }}<|im_start|>{{ .Role }}
{{ .Content }}<|im_end|>
{{ end }}<|im_start|>assistant
"""
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|im_start|>"
PARAMETER temperature 0.3
PARAMETER num_ctx 2048
EOF

if ! curl -sf -m 2 http://127.0.0.1:11434/api/tags >/dev/null; then
  echo ">>> Starting Ollama"
  (nohup ollama serve > "$MODELS/ollama-serve.log" 2>&1 &)
  sleep 3
fi
echo ">>> Loading the model into Ollama"
ollama create qwen2.5:1.5b -f Modelfile
echo ">>> Test:"
ollama run qwen2.5:1.5b "In one sentence: what is space motion sickness?"
echo ">>> Done. Restart VitalOrbit (./run.sh) and the assistant shows 'Local model · offline'."
