FROM rocker/r-ver:4.6.1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libgit2-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    libpng-dev \
    libtiff5-dev \
    libjpeg-dev \
    cmake \
    gfortran \
    liblapack-dev \
    libblas-dev \
    libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/r-service

COPY install_packages.R .
RUN Rscript install_packages.R

COPY . .

ENV PORT=8001
EXPOSE 8001

CMD ["Rscript", "entrypoint.R"]
