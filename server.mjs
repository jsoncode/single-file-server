import fs from 'fs'
import http from 'http'
import path from 'path'
import os from 'os'

const ip = getLocalIP();
const port = '80'
const rootPath = path.resolve()

var server = http.createServer(function (req, res) {
    // 允许跨域请求
    res.setHeader("Access-Control-Allow-Origin", "*");

    // 拼接相对地址
    let url = path.join('.', req.url)
    try {
        url = decodeURIComponent(url)
    } catch (e) {
        url = unescape(url)
    }
    // 如果文件不存在直接返回404
    if (!fs.existsSync(url)) {
        if (req.url.startsWith('/api/')) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            api(req, res)
            return;
        } else {
            res.statusCode = 404
            res.write('404')
            res.end();
            return;
        }
    }
    try {
        fs.accessSync(url, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
        res.statusCode = 403
        res.write('403')
        res.end()
        return;
    }
    if (fs.statSync(url).isDirectory()) {
        let objList = getDirList(url)
        res.write(indexHtml(objList));
        res.end()
    } else {
        var range = req.headers.range;
        if (range) {
            // 设置文件范围和对应的响应code206,可以让视频、音频拖放播放。
            var positions = range.replace(/bytes=/, "").split("-");
            var start = parseInt(positions[0], 10);
            var total = fs.statSync(url).size;
            var end = positions[1] ? parseInt(positions[1], 10) : total - 1;
            var chunksize = (end - start) + 1;

            res.writeHead(206, {
                "Content-Range": "bytes " + start + "-" + end + "/" + total,
                "Accept-Ranges": "bytes",
                "Content-Length": chunksize
            });
        }

        const readStream = fs.createReadStream(url)
        readStream.pipe(res)
        readStream.on('error', (err) => {
            res.end(err)
        })
    }
})

server.listen(port)

console.log(`服务器启动成功：http://localhost`);
console.log(`服务器启动成功：http://${ip}`);


function indexHtml(list) {
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"><meta charset="utf-8"><style>
body{margin:0;font-size:14px;line-height: 1.4;}
.item{display: flex;align-items: center;justify-content: space-between}
.item a{padding:10px;text-decoration: none;display:flex;flex-grow: 1;align-items: center;justify-content: space-between;
    }
.item.active a,
.item a:hover{background-color: #ddd}
.item a:visited{color:#bbb;}
.item .btnWrap{display: flex;align-items: center;justify-content: space-between;flex-shrink: 0;margin-left: 20px;}
.item .btnWrap button{display: flex;align-items: center;justify-content: center;background-color: #ddd;border:0;outline:0;padding:5px 10px;cursor:pointer;}
.item .btnWrap button:hover{opacity: .7}
.item .btnWrap button:not(:last-child){margin-right: 10px;}
.item .btnWrap button.del{border:0;background-color: red;color:#fff;}
.container{width:100%;max-width: 768px;margin: 0 auto;}
.player{height:400px;width:100%;display: block;border:0;}
</style></head><body>
        <div class="container">
            <div id="message"></div>
            <iframe class="player"></iframe>
            <div class="content">
                ${list.map(i => `<div class="item">
    
                    <a href="/${i.name}" data-type="${i.type}" data-size="${i.size}">${i.name.match(/[^\/]+$/)?.[0]}</a>
                    ${i.type === 'file' ? `<div class="btnWrap">
                        <button data-type="del" data-href="${i.name}" class="del">删除</button>
                        <button data-type="like" data-href="${i.name}">喜欢</button>
                        <button data-type="pendding" data-href="${i.name}">暂存</button>
                    </div>` : ''}
                </div>`).join('')}
            </div>
        </div>
    <script>
    let player = document.querySelector('.player')
    document.addEventListener('click',async (e)=>{
        let el = e.target;
        if(el.dataset.type==='file'){
            e.preventDefault()
            let href= el.getAttribute('href');
            if(/\.(mp3|mp4|mkv)/.test(href)){
                player.contentWindow.location.replace(href)
                player.onload=()=>{
                    player.contentDocument.querySelectorAll('video,audio')[0].play();
                }
            }
            Array.from(el.closest('.content').querySelectorAll('.item')).forEach(item=>{
                item.classList.remove('active')
            })
            el.closest('.item').classList.add('active')
        }else if(el.dataset.type==='del'){
            if (!confirm('确定要删除吗？')){
                return;
            }
            fetch('/api/del',{
                method: 'POST',
                body:JSON.stringify({
                    url: el.dataset.href
                })
            }).then(res=>res.json()).then(res=>{
                el.innerText = res.msg;
                el.closest('.item').parentElement.removeChild(el.closest('.item'));
                player.src = '';
            })
        }else if(el.dataset.type==='like'){
            fetch('/api/like',{
                method: 'POST',
                body:JSON.stringify({
                    url: el.dataset.href
                })
            }).then(res=>res.json()).then(res=>{
                el.innerText = res.msg;
                el.closest('.item').parentElement.removeChild(el.closest('.item'))
                player.src = '';
            })
        }else if(el.dataset.type==='pendding'){
            fetch('/api/pendding',{
                method: 'POST',
                body:JSON.stringify({
                    url: el.dataset.href
                })
            }).then(res=>res.json()).then(res=>{
                el.innerText = res.msg;
                el.closest('.item').parentElement.removeChild(el.closest('.item'))
                player.src = '';
            })
        }
    },false)
</script>
    </body></html>`
}


function getDirList(url) {
    let list = fs.readdirSync(url).filter(item => !(/(^|\/)\.[^\/\.]|^\$/g).test(item)).sort((a, b) => {
        if (/^[a-z]/i.test(a) || /^[a-z]/i.test(b)) {
            return a.localeCompare(b, 'en')
        } else {
            return a.localeCompare(b, 'zh-cn')
        }
    })
    let objList = []
    for (let item of list) {
        let fullPath = path.join(url, item)
        try {
            fs.accessSync(fullPath, fs.constants.R_OK | fs.constants.W_OK);
            let stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                objList.push({
                    name: fullPath.replace(/\\/g, '/'),
                    type: 'dir',
                    size: stat.size,
                })
            } else {
                objList.push({
                    name: fullPath.replace(/\\/g, '/'),
                    type: 'file',
                    size: stat.size,
                })
            }
        } catch (err) {
        }
    }
    return objList
}

function api(req, res) {
    let url = req.url;
    if (req.method === 'POST') {

        let result = '' //接收前端的参数
        //data事件，每次收到一部分参数数据就会触发一次这个事件。
        //1.数据大会分批次接收
        //2.数据小则可以一次性接收完毕
        req.on('data', (chunk) => { //chunk代表传入的数据
            result += chunk
        })

        // end事件，全部的参数数据接收完成之后会执行一次。
        req.on('end', () => {
            result = JSON.parse(result)
            let file = result.url;
            let dirPath = file.match(/[\/\\]([^\/\\]+)[\/\\]([^\/\\]+)$/)
            if (!fs.existsSync(file)) {
                res.end(JSON.stringify({
                    code: 0,
                    msg: '文件不存在'
                }))
                return
            } else {
                try {
                    fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
                } catch (err) {
                    res.end(JSON.stringify({
                        code: 1,
                        msg: '没有权限'
                    }))
                    return;
                }
            }

            if (url === '/api/del') {
                fs.unlinkSync(file)

                res.end(JSON.stringify({
                    code: 0,
                    msg: '删除成功'
                }))
            } else if (url === '/api/like') {
                fs.renameSync(file, path.join(rootPath, '好听单曲', dirPath[2]))
                res.end(JSON.stringify({
                    code: 0,
                    msg: '已经迁移到like目录'
                }))
            } else if (url === '/api/pendding') {
                let to = path.join(rootPath, '一般歌曲-待分组', dirPath[1]);
                if (!fs.existsSync(to)) {
                    fs.mkdirSync(to)
                }
                to = path.join(to, dirPath[2])
                fs.renameSync(file, to)
                res.end(JSON.stringify({
                    code: 0,
                    msg: '已经迁移到like目录'
                }))
            }
        })
    }
}

function getLocalIP() {
    const osType = os.type(); //系统类型
    const netInfo = os.networkInterfaces(); //网络信息
    let ip = '';
    if (osType === 'Windows_NT') {
        for (let dev in netInfo) {
            //win7的网络信息中显示为本地连接，win10显示为以太网
            if (dev === '本地连接' || dev === '以太网' || dev === 'WLAN') {
                for (let j = 0; j < netInfo[dev].length; j++) {
                    if (netInfo[dev][j].family === 'IPv4') {
                        ip = netInfo[dev][j].address;
                        break;
                    }
                }
            }
        }

    } else if (osType === 'Linux') {
        ip = netInfo.eth0[0].address;
    } else if (osType === 'Darwin') {
        // mac操作系统
        // ip = netInfo.eth0[0].address;
    } else {
        // 其他操作系统
    }

    return ip;
}
