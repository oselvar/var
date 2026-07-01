# Build and test every language port from the repo root.
#
#   make            # same as `make check`: all three ports
#   make typescript # pnpm build + pnpm check (lint, typecheck, test, knip, jscpd)
#   make python     # pytest + ruff
#   make java       # mvn verify (JDK 21, pinned in java/.tool-versions)
#
# Each target runs the same gate as that port's CI workflow in .github/workflows/.

.PHONY: check typescript python java

check: typescript python java

typescript:
	cd typescript && pnpm install && pnpm build && pnpm check

python:
	cd python && uv sync && uv run pytest && uv run ruff check

java:
	cd java && mvn --batch-mode verify
