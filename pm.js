const fetch = require("node-fetch");
class PM {
  static PM_KEYS = ["mmsfyc59gwtis3g8"];
  static apikey =
    this.getKeys()[Math.floor(Math.random() * this.getKeys().length)];

  static checkPremiumizeRes = (res = {}) => {
    if ("status" in res) {
      return res["status"] == "success";
    }
    return false;
  };

  static getKeys() {
    return this.PM_KEYS;
  }
  static checkAccount = async () => {
    let url = `https://www.premiumize.me/api/account/info?apikey=${this.apikey}`;
    try {
      let res = await fetch(url);
      return this.checkPremiumizeRes(await res.json());
    } catch (error) {
      console.log({ errorcheckAccount: error });
      return false;
    }
  };

  static checkCached = async (hash = "") => {
    if (!hash) return false;
    let url = `https://www.premiumize.me/api/cache/check?apikey=${this.apikey}&items[]=${hash}`;

    //console.log({url});
    try {
      let res = await fetch(url);

      // console.log({ status: res.status, statusText: res.statusText });
      let resJson = (await res.json()) ?? {};

      //console.log({ resJson });


      console.log('========================================================================');

      if (this.checkPremiumizeRes(resJson)) {
        if (
          "response" in resJson &&
          resJson["response"][0] &&
          "filename" in resJson &&
          resJson["filename"][0]
        )
          return resJson["filename"][0];
      }
      return false;
    } catch (error) {
      console.log({ errorCheckCached: error });
      return false;
    }
  };

  static getDirectDl = async (hash = "") => {
    if (!hash) return false;
    let url = `https://www.premiumize.me/api/transfer/directdl?apikey=${this.apikey}`;

    let form = new URLSearchParams();
    form.append("src", `magnet:?xt=urn:btih:${hash}`);

    try {
      let res = await fetch(url, {
        method: "POST",
        body: form,
        timeout: 5000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      let resJson = (await res.json()) ?? {};

      if (this.checkPremiumizeRes(resJson)) {
        if ("content" in resJson && resJson["content"])
          return resJson["content"];
      }
      return false;
    } catch (error) {
      console.log({ errorCached: error });
      return false;
    }
  };

  static pmTransferList = async (id = "") => {
    let url = `https://www.premiumize.me/api/transfer/list?apikey=${this.apikey}`;

    try {
      let res = await fetch(url, {
        method: "GET",
        timeout: 10000,
      });

      let resJson = (await res.json()) ?? {};

      if (this.checkPremiumizeRes(resJson)) {
        return "transfers" in resJson ? resJson["transfers"] : [];
      }

      return [];
    } catch (error) {
      return [];
    }
  };

  static pmFolderList = async () => {
    let url = `https://www.premiumize.me/api/folder/list?apikey=${this.apikey}`;

    try {
      let res = await fetch(url, {
        method: "GET",
        timeout: 10000,
      });

      let resJson = (await res.json()) ?? {};

      if (this.checkPremiumizeRes(resJson)) {
        return "content" in resJson ? resJson["content"] : [];
      }

      return [];
    } catch (error) {
      return [];
    }
  };

  static pmItemList = async () => {
    let url = `https://www.premiumize.me/api/item/listall?apikey=${this.apikey}`;

    try {
      let res = await fetch(url, {
        method: "GET",
        timeout: 10000,
      });

      let resJson = (await res.json()) ?? {};

      if (this.checkPremiumizeRes(resJson)) {
        return "files" in resJson ? resJson["files"] : [];
      }

      return [];
    } catch (error) {
      return [];
    }
  };

  static pmItemDetails = async (id = "") => {
    let url = `https://www.premiumize.me/api/item/details?apikey=${this.apikey}&id=${id}`;

    try {
      let res = await fetch(url, {
        method: "GET",
        timeout: 5000,
      });
      let resJson = (await res.json()) ?? {};
      if ("id" in resJson && resJson["id"]) {
        return resJson;
      }

      return {};
    } catch (error) {
      return {};
    }
  };

  static pmFolderDetails = async (id = "") => {
    let url = `https://www.premiumize.me/api/folder/list?apikey=${this.apikey}&id=${id}`;

    try {
      let res = await fetch(url, {
        method: "GET",
        timeout: 5000,
      });

      let resJson = (await res.json()) ?? {};

      let response = [];

      if (this.checkPremiumizeRes(resJson)) {
        let tmp = "content" in resJson ? resJson["content"] : [];
        for (const el of tmp) {
          if (el["type"] == "file") {
            response.push(el);
          } else if ((el["type"] = "folder")) {
            let res_temp = await this.pmFolderDetails(el["id"]);
            response = response.concat(res_temp);
          }
        }

        return response;
      }

      return [];
    } catch (error) {
      return [];
    }
  };

  static checkTorrentFileinPM = async (param = "", type = "file") => {
    if (!param) return null;
    try {
      let itemList = await this.pmFolderList();

      if (!itemList || !itemList.length) return null;

      let file = await new Promise((resolve, reject) => {
        resolve(
          itemList.find((el) => {
            return el["name"] == param;
          })
        );
      });

      return "id" in file ? file : null;
    } catch (error) {
      return null;
    }
  };

  static pmFolderId = async (transferId = "") => {
    try {
      let tranfers = await this.pmTransferList();

      if (!tranfers || !tranfers.length) return null;

      let folder = await new Promise((resolve, reject) => {
        resolve(
          tranfers.find((el) => {
            return el["id"] == transferId || el["name"] == transferId;
          })
        );
      });

      return "folder_id" in folder ? folder["folder_id"] : null;
    } catch (error) {
      return null;
    }
  };

  static addMagnetToPM = async (magnet = "") => {
    // let check = await checkAccount();
    // if (!check) return null;

    let url = `https://www.premiumize.me/api/transfer/create?apikey=${this.apikey}`;
    let form = new URLSearchParams();

    form.append("src", magnet);

    try {
      let res = await fetch(url, {
        method: "POST",
        body: form,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 5000,
      });
      let resJson = (await res.json()) ?? {};
      // console.log({ resJson });

      if (this.checkPremiumizeRes(resJson)) {
        return "id" in resJson ? resJson["id"] : false;
        // {
        //   "status": "success",
        //   "id": "WsaYYCdDzDIHckfkf8dD0g",
        //   "name": "Game Of Thrones Saison 1 [1080p] MULTI BluRay-Pop .Le Trône De Fer 2011",
        //   "type": "torrent"
        // }
      }
    } catch (error) {
      console.log({ addreserror: error });
      return false;
    }
  };

  static deleteMagnetFromPM = async (id = "") => {
    let url = `https://www.premiumize.me/api/transfer/delete?apikey=${this.apikey}`;
    // let form = new FormData();
    let form = new URLSearchParams();

    form.append("id", id);
    console.log(`FORM: id: ${form.get("id")}`);
    try {
      let res = await fetch(url, {
        method: "POST",
        body: form,
        timeout: 5000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      let resJson = (await res.json()) ?? {};

      console.log({ resJson });
      if (this.checkPremiumizeRes(resJson)) {
        return resJson;
        // {
        //   "status": "success",
        // }
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  static pmDeleteAllStagnedTransfer = async () => {
    let list = await this.pmTransferList();

    let res = await Promise.all(
      list
        .filter((el) => {
          return (
            el["status"] == "running" &&
            (el["message"].includes("unknown left") || el["progress"] == 0)
          );
        })
        .map((el) => {
          return this.deleteMagnetFromPM(el["id"]);
        })
    );

    return res;
  };
}

module.exports = {
  PM,
};
