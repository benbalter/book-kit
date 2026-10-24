# The book-kit toolchain in one image: pandoc, WeasyPrint, Ghostscript, Node,
# just, Python build deps. For reproducible local builds and parity checks:
# fonts differ between macOS and Linux, so compare builds made in the same image.
#
#   docker build -f docker/Dockerfile -t book-kit .
#   docker run --rm -v "$PWD:/book" -w /book book-kit just all
#
# Versions come from toolchain.json (tests/toolchain.test.js keeps the ARGs and
# requirements.txt in sync with it).
FROM ubuntu:26.04

ARG PANDOC_VERSION=3.12.1
ARG NODE_MAJOR=24
ARG JUST_VERSION=1.58.0

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update -o Acquire::Retries=3 \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq unzip zip \
      python3 python3-pip \
      ghostscript poppler-utils \
      fonts-noto-color-emoji \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 \
 && arch="$(dpkg --print-architecture)" \
 && curl -fsSL -o /tmp/pandoc.deb "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-1-${arch}.deb" \
 && dpkg -i /tmp/pandoc.deb && rm /tmp/pandoc.deb \
 && curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && curl -fsSL https://just.systems/install.sh | bash -s -- --tag "${JUST_VERSION}" --to /usr/local/bin \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

WORKDIR /book
