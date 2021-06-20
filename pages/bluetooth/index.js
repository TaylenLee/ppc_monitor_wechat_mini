const app = getApp()

function inArray(arr, key, val) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i][key] === val) {
      return i;
    }
  }
  return -1;
}

// ArrayBuffer转16进度字符串示例
function ab2hex(buffer) {
  var hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join('');
}

Page({
  data: {
    devices: [],
    connected: false,
    chs: [],
    ppg_data: [],
    count_data: 0,
    sampleCounter: 0,
    lastBeatTime: 0,
    P: 512,
    T: 512,
    thresh: 530,
    amp: 0,
    firstBeat: true,
    secondBeat: false,
    IBI:600,
    Pulse: false,
    rate:[],
  },
  openBluetoothAdapter() {
    wx.openBluetoothAdapter({
      success: (res) => {
        console.log('openBluetoothAdapter success', res)
        this.startBluetoothDevicesDiscovery()
      },
      fail: (res) => {
        if (res.errCode === 10001) {
          wx.onBluetoothAdapterStateChange(function (res) {
            console.log('onBluetoothAdapterStateChange', res)
            if (res.available) {
              this.startBluetoothDevicesDiscovery()
            }
          })
        }
      }
    })
  },
  getBluetoothAdapterState() {
    wx.getBluetoothAdapterState({
      success: (res) => {
        console.log('getBluetoothAdapterState', res)
        if (res.discovering) {
          this.onBluetoothDeviceFound()
        } else if (res.available) {
          this.startBluetoothDevicesDiscovery()
        }
      }
    })
  },
  startBluetoothDevicesDiscovery() {
    if (this._discoveryStarted) {
      return
    }
    this._discoveryStarted = true
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: true,
      success: (res) => {
        console.log('startBluetoothDevicesDiscovery success', res)
        this.onBluetoothDeviceFound()
      },
    })
  },
  stopBluetoothDevicesDiscovery() {
    wx.stopBluetoothDevicesDiscovery()
  },
  onBluetoothDeviceFound() {
    wx.onBluetoothDeviceFound((res) => {
      res.devices.forEach(device => {
        if (!device.name && !device.localName) {
          return
        }
        const foundDevices = this.data.devices
        const idx = inArray(foundDevices, 'deviceId', device.deviceId)
        const data = {}
        if (idx === -1) {
          data[`devices[${foundDevices.length}]`] = device
        } else {
          data[`devices[${idx}]`] = device
        }
        this.setData(data)
      })
    })
  },
  createBLEConnection(e) {
    const ds = e.currentTarget.dataset
    const deviceId = ds.deviceId
    const name = ds.name
    wx.createBLEConnection({
      deviceId,
      success: (res) => {
        this.setData({
          connected: true,
          name,
          deviceId,
        })
        this.getBLEDeviceServices(deviceId)
        for (let i = 0; i < 10; i++) {
          this.data.ppg_data.push(0)
        }
      }
    })
    this.stopBluetoothDevicesDiscovery()
  },
  closeBLEConnection() {
    wx.closeBLEConnection({
      deviceId: this.data.deviceId
    })
    this.setData({
      connected: false,
      chs: [],
    })
  },
  getBLEDeviceServices(deviceId) {
    wx.getBLEDeviceServices({
      deviceId,
      success: (res) => {
        for (let i = 0; i < res.services.length; i++) {
          if (res.services[i].isPrimary) {
            this.getBLEDeviceCharacteristics(deviceId, res.services[i].uuid)
            return
          }
        }
      }
    })
  },
  getBLEDeviceCharacteristics(deviceId, serviceId) {
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (res) => {
        console.log('getBLEDeviceCharacteristics success', res.characteristics)
        for (let i = 0; i < res.characteristics.length; i++) {
          let item = res.characteristics[i]
          if (item.properties.read) {
            wx.readBLECharacteristicValue({
              deviceId,
              serviceId,
              characteristicId: item.uuid,
            })
          }
          if (item.properties.notify || item.properties.indicate) {
            wx.notifyBLECharacteristicValueChange({
              deviceId,
              serviceId,
              characteristicId: item.uuid,
              state: true,
            })
          }
        }
      },
      fail(res) {
        console.error('getBLEDeviceCharacteristics', res)
      }
    })
    // 操作之前先监听，保证第一时间获取数据
    wx.onBLECharacteristicValueChange((characteristic) => {
      const idx = inArray(this.data.chs, 'uuid', characteristic.characteristicId)
      const data = {}
      if (idx === -1) {
        data[`chs[${this.data.chs.length}]`] = {
          uuid: characteristic.characteristicId,
          value: ab2hex(characteristic.value)
        }
      } else {
        const hexVal=ab2hex(characteristic.value);
        data[`chs[${idx}]`] = {
          uuid: characteristic.characteristicId,
          value: hexVal
        }
        if(characteristic.serviceId == "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"){//脉搏波数据1521
          // console.log("get ppg data");
          this.setGlobalNewPpgVal(hexVal);
        }
      }
      this.setData(data)
    })
  },
  showInChart() {  //打开图表展示界面
    wx.navigateTo({
      url: '../index/index'
    });
  },
  setGlobalNewVal(hexVal){  //接收到蓝牙数据后，设置为最新全局数据（全局数据在app.js中定义）
    //设置为全局数据
    app.globalData.newBTVal=hexVal;
    app.globalData.newBTValCreateTime=new Date().getTime();
  },
  setGlobalNewPpgVal(hexVal){   //接收到蓝牙数据后，将其换算成对应的心电数据并存入ppg_data全局列表中（全局数据在app.js中定义）
    let nowTime = new Date().getTime();
    let ydata = 0;
    for (let i = 0; i < hexVal.length/2; i++) { //按4个字符进行截取（每个字符代表4位，4个字符就是16位）
      let y = parseInt(hexVal.substring(i * 2, i * 2 + 2), 16) - 48;
      // console.log(y);
      ydata = ydata + y*Math.pow(10,hexVal.length/2-i-1);
    }
    ydata = ydata;
    console.log(ydata);
    // app.globalData.bpm = ydata;
    this.data.sampleCounter = this.data.sampleCounter + 2;
    let N = this.data.sampleCounter - this.data.lastBeatTime;
    if(ydata < this.data.thresh && N > (this.data.IBI/5)*3){       // avoid dichrotic noise by waiting 3/5 of last IBI
      if (ydata < this.data.T){                        // T is the trough
        this.data.T = ydata;                         // keep track of lowest point in pulse wave
      }
    }
    if(ydata > this.data.thresh && ydata > this.data.P){          // thresh condition helps avoid noise
      this.data.P = ydata;                             // P is the peak
    }

    if (N > 250){                                   // avoid high frequency noise
      if ( (ydata > this.data.thresh) && (this.data.Pulse == false) && (N > (this.data.IBI/5)*3) ){
        this.data.Pulse = true;                               // set the Pulse flag when we think there is a pulse
        this.data.IBI = this.data.sampleCounter - this.data.lastBeatTime;         // measure time between beats in mS
        this.data.lastBeatTime = this.data.sampleCounter;               // keep track of time for next pulse
  
        if(this.data.secondBeat){                        // if this is the second beat, if secondBeat == TRUE
          this.data.secondBeat = false;                  // clear secondBeat flag
          for(let i=0; i<=9; i++){             // seed the running total to get a realisitic BPM at startup
            this.data.rate[i] = this.data.IBI;
          }
        }
  
        if(this.data.firstBeat){                         // if it's the first time we found a beat, if firstBeat == TRUE
          this.data.firstBeat = false;                   // clear firstBeat flag
          this.data.secondBeat = true;                   // set the second beat flag
          return;                              // IBI value is unreliable so discard it
        }
  
  
        // keep a running total of the last 10 IBI values
        let runningTotal = 0;                  // clear the runningTotal variable
  
        for(let i=0; i<=8; i++){                // shift data in the rate array
          this.data.rate[i] = this.data.rate[i+1];                  // and drop the oldest IBI value
          runningTotal += this.data.rate[i];              // add up the 9 oldest IBI values
        }
  
        this.data.rate[9] = this.data.IBI;                          // add the latest IBI to the rate array
        runningTotal += this.data.rate[9];                // add the latest IBI to runningTotal
        runningTotal /= 10;                     // average the last 10 IBI values
        app.globalData.bpm = parseInt(60000/runningTotal-25);               // how many beats can fit into a minute? that's BPM!
        // console.log(app.globalData.bpm);
        // QS FLAG IS NOT CLEARED INSIDE THIS ISR
      }
    }
    if (ydata < this.data.thresh && this.data.Pulse == true){   // when the values are going down, the beat is over
      this.data.Pulse = false;                         // reset the Pulse flag so we can do it again
      this.data.amp = this.data.P - this.data.T;                           // get amplitude of the pulse wave
      this.data.thresh = this.data.amp/2 + this.data.T;                    // set thresh at 50% of the amplitude
      this.data.P = this.data.thresh;                            // reset these for next time
      this.data.T = this.data.thresh;
    }
  
    if (N > 2500){                           // if 2.5 seconds go by without a beat
      this.data.thresh = 530;                          // set thresh default
      this.data.P = 512;                               // set P default
      this.data.T = 512;                               // set T default
      this.data.lastBeatTime = this.data.sampleCounter;          // bring the lastBeatTime up to date
      this.data.firstBeat = true;                      // set these to avoid noise
      this.data.secondBeat = false;                    // when we get the heartbeat back
    }

    // this.data.count_data = this.data.count_data + 1;
    // console.log(this.data.count_data);
    ydata = ydata / 2048 * 3.3;
    let xdata = this.getDateTimeStr(nowTime);
    this.data.ppg_data.shift();
    this.data.ppg_data.push(ydata);
    let sum = 0;
    for (let i = 0; i < this.data.ppg_data.length; i++) {
        sum+=this.data.ppg_data[i];
    };
    ydata = sum / this.data.ppg_data.length;
    app.globalData.ppg_data.push({
        x: xdata,
        y: ydata,
      });
    // console.log(ydata);
  },
  getDateTimeStr(timeMillis) { //根据timeMillis显示“hh:mm:ss”的时间格式
    var date = new Date(timeMillis);
    //年
    var Y = date.getFullYear();
    //月
    var M = (date.getMonth() + 1 < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1);
    //日
    var D = date.getDate() < 10 ? '0' + date.getDate() : date.getDate();
    //时
    var h = date.getHours() < 10 ? '0' + date.getHours() : date.getHours();
    //分
    var m = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
    //秒
    var s = date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds();
  
    // console.log(Y + "-" + M + "-" + D + " " + h + ":" + m + ":" + s );
    // console.log(h + ":" + m + ":" + s );
    return h + ":" + m + ":" + s;
  },
})
