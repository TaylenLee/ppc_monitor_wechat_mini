import * as echarts from '../../ec-canvas/echarts';

const app = getApp();
const LINE0 = '脉搏波';
const chartMap = {}; //保存chart对象
const dataMap = {}; //保存数据对象
const sampleMap = {}; //保存采样参数数据
let g_dpr=1;  

function getDateTimeStr(timeMillis) { //根据timeMillis显示“hh:mm:ss”的时间格式
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

  return h + ":" + m + ":" + s;
}

function initChart(canvas, width, height, dpr, lineName) { //初始化脉搏波图表
  if(dpr!=undefined) g_dpr=dpr;   //这里使用g_dpr来设置，以防止dpr偶尔为undefined时导致程序出错
  const chart = echarts.init(canvas, null, {
    width: width,
    height: height,
    devicePixelRatio: g_dpr 
  });
  canvas.setChart(chart);

  //初始化图表数据
  dataMap[lineName] = []; //保存line数据（用于实现一个队列）
  let queue_length=1800;  //脉搏队列长度

  sampleMap[lineName] = {
    sliceNum: 40,  // 每次更新图表移除40个数据点
    sampleFre: 500, // 心音采样频率为500Hz
  };

  //转化为图表使用的数据
  const xData = [],
    yData = [];
 
  for (let i = 0; i < queue_length; i++) { //默认初始化队列中的N条数据
    dataMap[lineName].push({
      x: '',
      y: 0,
    });
    //初始化图表使用数据
    xData.push('');
    yData.push(dataMap[lineName][i].y);
  }

  var option = {
    title: {
      text: [lineName],
      top: 10,
      bottom: 0,
      left: 'center',
      padding: 0,
    },
    legend: {
      show: false, 
    },
    grid: {
      containLabel: true,
      left: 10,
      right: 10,
      top: 40,
      bottom: 10,
    },
    tooltip: {
      show: false, //取消鼠标滑过的提示框
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData,
    },
    yAxis: {
      min:0,
      max:3.5,
      type: 'value',
      splitLine: {
        lineStyle: {
          type: 'dashed'
        }
      }
    },
    series: [{
      name: lineName,
      type: 'line',
      smooth: true,
      data: yData,
      symbol: 'none', //取消折点圆圈
    }]
  };

  chart.setOption(option);
  chartMap[lineName] = chart;

  return chart;
}


function showDataByLineName(lineName, newValArr) { //刷新显示lineName对应的图表数据
  const chart = chartMap[lineName];
  if (chart==undefined||chart==null) return; //如果还没有初始化好，则退出

  const data=dataMap[lineName];
  let tempData = [...data, ...newValArr]; //合并两个数据数组（相当于从队列右侧进入队列）
  tempData.splice(0, newValArr.length); //去除掉多的数据（相当于从队列左侧退出队列）
  for(let i=0;i<data.length;i++){  //替换原有数据
    data[i]=tempData[i];
  }

  //转化为图表使用的数据
  const xData = [],
    yData = [];
  for (let i = 0; i < data.length; i++) {
    xData.push(data[i].x);
    yData.push(data[i].y);
  }

  //设置图表数据
  chart.setOption({
    xAxis: {
      data: xData
    },
    series: [{
      data: yData
    }]
  })
}

Page({
  data: {
    bpm: 0,
    line0: {
      onInit: (...param) => {
        return initChart(...param, LINE0);
      }
    },
  },

  onLoad() {
    app.globalData.t = this;
    //实时更新脉搏数据图表显示
    setInterval(function updataPpgChart() {
      if(!(chartMap[LINE0])) return;  //等待Ppgchart未初始化完成
      const sliceNum = sampleMap[LINE0].sliceNum;
      const PpgCahrtData = app.globalData.ppg_data.slice(0,sliceNum);
      app.globalData.ppg_data.splice(0,sliceNum);
      if(PpgCahrtData==null) return;
      //更新图表显示
      showDataByLineName(LINE0, PpgCahrtData);
      // this.data.bpm = app.globalData.bpm;
      app.globalData.t.setData({
        bpm: app.globalData.bpm
      })
    }, 20);
  }
});