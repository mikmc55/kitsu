const bencode = require("bencode");
const crypto = require("crypto");
const fs = require("fs").promises;
const parseTorrent = require("parse-torrent");

class TorrentParser {
  constructor() {
    this.metadata = null;
    this.client = null;
  }

  async initialize() {
    const WebTorrent = await import("webtorrent");
    this.client = new WebTorrent.default();
  }

  async parse(input, extraHeaders = {}) {
    if (input.startsWith("magnet:")) {
      if (!this.client) {
        await this.initialize();
      }
      return await this.handleMagnet(input);
    }

    try {
      let buffer;
      if (input.startsWith("http")) {
        try {
          const response = await fetch(input, {
            headers: extraHeaders,
          });
          buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.length == 0) {
            return null;
          }
        } catch (error) {
          console.log({ error });
        }
      } else {
        buffer = await fs.readFile(input);
      }

      this.metadata = bencode.decode(buffer);
      return this.parseMetadata();
    } catch (error) {}
    return null;
  }

  async handleMagnet(magnetUri) {
    const parsed = parseTorrent(magnetUri);
    let isResolved = false;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.log("timeout");
        if (!isResolved) {
          isResolved = true;
          // this.destroy();
          resolve({
            infoHash: parsed.infoHash,
            name: parsed.name,
            files: [],
            trackers: parsed.announce,
            magnetURI: magnetUri,
          });
        }
      }, 12000);

      const addTorrent = this.client.add(magnetUri, { maxWebConns: 20 });

      addTorrent.on("error", (err) => {
        console.log("error");

        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          // this.destroy();
          resolve({
            infoHash: parsed.infoHash,
            name: parsed.name,
            files: [],
            trackers: parsed.announce,
            magnetURI: magnetUri,
          });
        }
      });

      addTorrent.on("ready", () => {
        console.log("ready");
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);

          const files = addTorrent.files.map((file) => ({
            path: file.path,
            length: file.length,
            name: file.name,
          }));

          const result = {
            infoHash: parsed.infoHash,
            name: parsed.name,
            files,
            trackers: parsed.announce,
            magnetURI: magnetUri,
            length: addTorrent.length,
            pieceLength: addTorrent.pieceLength,
          };

          // addTorrent.destroy();
          // this.destroy();
          resolve(result);
        } else {
          // addTorrent.destroy();
        }
      });
    });
  }

  destroy() {
    if (this.client) {
      this.client.destroy({ destroyStore: true });
      this.client = null;
    } else {
    }
  }

  parseMetadata() {
    return {
      infoHash: this.getInfoHash(),
      name: this.getName(),
      files: this.getFiles(),
      length: this.getLength(),
      pieceLength: this.getPieceLength(),
      lastPieceLength: this.getLastPieceLength(),
      pieces: this.getPieces(),
      trackers: this.getTrackers(),
    };
  }

  getInfoHash() {
    if (!this.metadata) return null;
    const info = bencode.encode(this.metadata?.info);
    return crypto.createHash("sha1").update(info).digest("hex");
  }

  getName() {
    return this.metadata?.info.name.toString();
  }

  getFiles() {
    if (!this.metadata?.info.files) {
      return [
        {
          path: this.getName(),
          name: this.getName(),
          length: this.metadata?.info.length,
        },
      ];
    }
    return this.metadata?.info.files
      .map((file) => {
        return {
          path: file.path.map((p) => p.toString()).join("/"),
          name: file.path.map((p) => p.toString()).join("/"),
          length: file.length,
        };
      })
      .filter((file) => !!file && !!file.path);
  }

  getLength() {
    return this.metadata?.info.length;
  }

  getPieceLength() {
    return this.metadata?.info["piece length"];
  }

  getLastPieceLength() {
    const pieceLength = this.getPieceLength();
    const totalLength = this.getLength();
    return totalLength % pieceLength || pieceLength;
  }

  getPieces() {
    return this.metadata?.info.pieces;
  }

  getTrackers() {
    const announce = this.metadata?.announce?.toString();
    const announceList =
      this.metadata && "announce-list" in this.metadata
        ? this.metadata["announce-list"]?.map((tracker) => tracker.toString())
        : [];
    return announceList || (announce ? [announce] : []);
  }
}

module.exports = TorrentParser;
