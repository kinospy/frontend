import React from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Components
import TradeChart from "../../components/Chart/TradeChart/TradeChart";
import TradeHead from "../../components/TradeComponents/TradeHead/TradeHead";
import TradePriceTable from "../../components/TradeComponents/TradePriceTable/TradePriceTable";

// Layout
import Header from "../../layout/header/Header";
import Footer from "../../layout/Footer/Footer";

// css
import "./style.css";
import TradePriceBtcTable from "../../components/TradeComponents/TradePriceBtcTable/TradePriceBtcTable";

// import TradePriceBtcHead from "../../components/TradeComponents/TradePriceBtcHead/TradePriceBtcHead";
import TradePriceHeadSecond from "../../components/TradeComponents/TradePriceHeadSecond/TradePriceHeadSecond";
import SpotBox from "../../components/TradeComponents/SpotBox/SpotBox";

// Helpers
import {
    zigzagws,
    signin,
    broadcastfill,
    getAccountState,
    getFillDetailsWithoutFee,
    getOrderDetailsWithoutFee,
    isZksyncChain,
    validMarkets,
} from "../../helpers";

class Trade extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            chainId: 1,
            user: {},
            marketFills: {},
            userOrders: {},
            userFills: {},
            marketSummary: {},
            lastPrices: {},
            orders: {},
            liquidity: [],
            currentMarket: "ETH-USDT",
            marketDataTab: "fills",
        };
    }

    componentDidMount() {
        // Update user every 10 seconds
        setInterval(this.updateUser.bind(this), 10000);

        zigzagws.addEventListener("message", async (e) => {
            const msg = JSON.parse(e.data);
            if (!["pong", "lastprice"].includes(msg.op)) {
                console.log(e.data);
            }
            let newstate;
            switch (msg.op) {
                case "orders":
                    newstate = { ...this.state };
                    const orders = msg.args[0];
                    orders.forEach((order) => {
                        if (
                            order[2] === this.state.currentMarket &&
                            order[0] === this.state.chainId
                        ) {
                            newstate.orders[order[1]] = order;
                        }
                        if (
                            this.state.user.id &&
                            order[8] === this.state.user.id.toString()
                        ) {
                            newstate.userOrders[order[1]] = order;
                        }
                    });

                    // zksync warning if more than one limit order is open
                    if (
                        this.state.user.id &&
                        isZksyncChain(this.state.chainId)
                    ) {
                        const userOpenOrders = Object.values(
                            newstate.userOrders
                        ).filter((o) => o[9] === "o");
                        if (userOpenOrders.length > 1) {
                            toast.warn(
                                "Filling a new order will cancel all previous orders. It is recommended to only have one open order at a time.",
                                { autoClose: 15000 }
                            );
                        }
                    }
                    this.setState(newstate);
                    break;
                case "fills":
                    newstate = { ...this.state };
                    const fillhistory = msg.args[0];
                    fillhistory.forEach((fill) => {
                        const fillid = fill[1];
                        if (
                            fill[2] === this.state.currentMarket &&
                            fill[0] === this.state.chainId
                        ) {
                            newstate.marketFills[fillid] = fill;
                        }
                        if (
                            this.state.user.id &&
                            (fill[8] === this.state.user.id.toString() ||
                                fill[9] === this.state.user.id.toString())
                        ) {
                            newstate.userFills[fillid] = fill;
                        }
                    });
                    this.setState(newstate);
                    break;
                case "marketsummary":
                    this.setState({
                        ...this.state,
                        marketSummary: {
                            market: msg.args[0],
                            price: msg.args[1],
                            "24hi": msg.args[2],
                            "24lo": msg.args[3],
                            priceChange: msg.args[4],
                            baseVolume: msg.args[5],
                            quoteVolume: msg.args[6],
                        },
                    });
                    break;
                case "lastprice":
                    const priceUpdates = msg.args[0];
                    newstate = { ...this.state };
                    priceUpdates.forEach((update) => {
                        const market = update[0];
                        const price = update[1];
                        const change = update[2];
                        if (validMarkets[this.state.chainId].includes(market)) {
                            newstate.lastPrices[market] = { price, change };
                        }
                        else {
                            delete newstate.lastPrices[market];
                        }
                        if (market === this.state.currentMarket) {
                            newstate.marketSummary.price = update[1];
                            newstate.marketSummary.priceChange = update[2];
                        }
                    });
                    this.setState(newstate);
                    break;
                case "liquidity":
                    newstate = { ...this.state };
                    const liquidity = msg.args[2];
                    newstate.liquidity.push(...liquidity);
                    this.setState(newstate);
                    break;
                case "userordermatch":
                    const matchedOrderId = msg.args[1];
                    const broadcastOrderToast = toast.info(
                        "Sign again to broadcast order..."
                    );
                    const { success, swap } = await broadcastfill(
                        msg.args[2],
                        msg.args[3]
                    );
                    newstate = { ...this.state };
                    delete newstate.orders[matchedOrderId];
                    if (success) {
                        toast.success("Filled: " + swap.txHash);
                    } else {
                        toast.error(swap.error.message);
                    }
                    toast.dismiss(broadcastOrderToast);
                    this.setState(newstate);
                    break;
                case "fillstatus":
                    newstate = { ...this.state };
                    const fillUpdates = msg.args[0];
                    fillUpdates.forEach((update) => {
                        const fillid = update[1];
                        const newstatus = update[2];
                        let txhash;
                        if (update[3]) txhash = update[3];
                        if (newstate.marketFills[fillid]) {
                            newstate.marketFills[fillid][6] = newstatus;
                            if (txhash)
                                newstate.marketFills[fillid][7] = txhash;
                        }
                        if (newstate.userFills[fillid]) {
                            newstate.userFills[fillid][6] = newstatus;
                            if (txhash)
                                newstate.marketFills[fillid][7] = txhash;
                        }
                    });
                    break;
                case "orderstatus":
                    newstate = { ...this.state };
                    const orderUpdates = msg.args[0];
                    orderUpdates.forEach(async (update) => {
                        const orderid = update[1];
                        const newstatus = update[2];
                        let filledorder;
                        switch (newstatus) {
                            case "c":
                                delete newstate.orders[orderid];
                                if (newstate.userOrders[orderid]) {
                                    newstate.userOrders[orderid][9] = "c";
                                }
                                break;
                            case "pm":
                                const remaining = update[4];
                                if (newstate.orders[orderid]) {
                                    newstate.orders[orderid][9] = "pm";
                                    newstate.orders[orderid][11] = remaining;
                                }
                                if (newstate.userOrders[orderid]) {
                                    newstate.userOrders[orderid][9] = "pm";
                                    newstate.userOrders[orderid][11] =
                                        remaining;
                                }
                                break;
                            case "m":
                                if (newstate.orders[orderid]) {
                                    newstate.orders[orderid][9] = "m";
                                    newstate.orders[orderid][11] = 0;
                                }
                                if (newstate.userOrders[orderid]) {
                                    newstate.userOrders[orderid][9] = "m";
                                    newstate.userOrders[orderid][11] = 0;
                                }
                                newstate = this.handleOrderMatch(
                                    newstate,
                                    orderid
                                );
                                break;
                            case "pf":
                                if (newstate.orders[orderid]) {
                                    newstate.orders[orderid][9] = "pf";
                                }
                                if (newstate.userOrders[orderid]) {
                                    newstate.userOrders[orderid][9] = "pf";
                                }
                                break;
                            case "f":
                                filledorder = newstate.userOrders[orderid];
                                if (filledorder) {
                                    const txhash = update[3];
                                    const sideText =
                                        filledorder[3] === "b" ? "buy" : "sell";
                                    const baseCurrency =
                                        filledorder[2].split("-")[0];
                                    filledorder[9] = "f";
                                    filledorder[10] = txhash;
                                    const noFeeOrder =
                                        getOrderDetailsWithoutFee(filledorder);
                                    toast.success(
                                        `Your ${sideText} order for ${
                                            noFeeOrder.baseQuantity.toPrecision(
                                                4
                                            ) / 1
                                        } ${baseCurrency} @ ${
                                            noFeeOrder.price.toPrecision(4) / 1
                                        } was filled!`
                                    );
                                    setTimeout(
                                        this.updateUser.bind(this),
                                        1000
                                    );
                                    setTimeout(
                                        this.updateUser.bind(this),
                                        5000
                                    );
                                }
                                break;
                            case "b":
                                const txhash = update[3];
                                filledorder = newstate.userOrders[orderid];
                                if (filledorder) {
                                    filledorder[9] = "b";
                                    filledorder[10] = txhash;
                                }
                                break;
                            case "r":
                                filledorder = newstate.userOrders[orderid];
                                if (filledorder) {
                                    const sideText =
                                        filledorder[3] === "b" ? "buy" : "sell";
                                    const txhash = update[3];
                                    const error = update[4];
                                    const baseCurrency =
                                        filledorder[2].split("-")[0];
                                    filledorder[9] = "r";
                                    filledorder[10] = txhash;
                                    const noFeeOrder =
                                        getOrderDetailsWithoutFee(filledorder);
                                    toast.error(
                                        `Your ${sideText} order for ${
                                            noFeeOrder.baseQuantity.toPrecision(
                                                4
                                            ) / 1
                                        } ${baseCurrency} @ ${
                                            noFeeOrder.price.toPrecision(4) / 1
                                        } was rejected: ${error}`
                                    );
                                    toast.info(
                                        `This happens occasionally. Run the transaction again and you should be fine.`
                                    );
                                }
                                break;
                            default:
                                break;
                        }
                    });
                    this.setState(newstate);
                    break;
                default:
                    break;
            }
        });
        zigzagws.addEventListener("open", () => {
            zigzagws.send(
                JSON.stringify({
                    op: "subscribemarket",
                    args: [this.state.chainId, this.state.currentMarket],
                })
            );
        });
        if (window.ethereum) {
            window.ethereum.on("accountsChanged", (accounts) => {
                const newState = { ...this.state };
                newState.user = {};
                this.setState(newState);
            });
        }
    }

    async updateUser() {
        if (this.state.user.id) {
            const newstate = { ...this.state };
            const initChainId = this.state.chainId;
            newstate.user = await getAccountState(this.state.chainId);
            
            // Sometimes the user changes chains in the middle of a state update
            if (this.state.chainId === initChainId) {
                this.setState(newstate);
            }
        }
    }

    handleOrderMatch(state, orderid) {
        let newstate = { ...state };
        const matchedorder = state.orders[orderid];
        if (!matchedorder) {
            return newstate;
        }
        matchedorder[9] = "m";
        delete newstate.orders[orderid];
        if (
            matchedorder &&
            state.user.id &&
            matchedorder[8] === state.user.id.toString()
        ) {
            if (!newstate.userOrders[matchedorder[1]]) {
                newstate.userOrders[matchedorder[1]] = matchedorder;
            }
        }

        return newstate;
    }

    async signInHandler() {
        let syncAccountState;
        try {
            syncAccountState = await signin(this.state.chainId);
        } catch (e) {
            toast.error(e.message);
            return false;
        }
        const newState = { ...this.state };
        newState.user = syncAccountState;
        newState.user.isSignedIn = true;
        for (let orderid in newState.orders) {
            if (newState.orders[orderid][8] === newState.user.id.toString()) {
                newState.userOrders[orderid] = newState.orders[orderid];
            }
        }
        this.setState(newState);
    }

    updateMarketChain(chainId, market) {
        if (typeof market === "undefined") market = this.state.currentMarket;
        if (typeof chainId === "undefined") chainId = this.state.chainId;
        const newState = { ...this.state };
        zigzagws.send(
            JSON.stringify({
                op: "unsubscribemarket",
                args: [this.state.chainId, this.state.currentMarket],
            })
        );
        if (this.state.chainId !== chainId) {
            newState.user = {};
            newState.userOrders = {};
            newState.userFills = {};
        }
        if (!validMarkets[chainId].includes(market)) {
            newState.currentMarket = "ETH-USDT";
        }
        else {
            newState.currentMarket = market;
        }
        newState.orders = {};
        newState.liquidity = [];
        newState.marketSummary = {};
        newState.marketFills = {};
        newState.chainId = chainId;
        this.setState(newState);
        zigzagws.send(
            JSON.stringify({
                op: "subscribemarket",
                args: [newState.chainId, newState.currentMarket],
            })
        );
    }

    updateMarketDataTab(tab) {
        const newstate = { ...this.state };
        newstate.marketDataTab = tab;
        this.setState(newstate);
    }

    render() {
        const lastPriceTableData = [];
        const markets = [];
        Object.keys(this.state.lastPrices).forEach((market) => {
            markets.push(market);
            const price = this.state.lastPrices[market].price;
            const change = this.state.lastPrices[market].change;
            const pctchange = ((change / price) * 100).toFixed(2);
            lastPriceTableData.push({
                td1: market,
                td2: price,
                td3: pctchange,
            });
        });

        const openOrdersData = [];
        const orderbookBids = [];
        const orderbookAsks = [];
        for (let orderid in this.state.orders) {
            const order = this.state.orders[orderid];
            const market = order[2];
            const side = order[3];
            const price = order[4];
            const remaining = isNaN(Number(order[11])) ? order[5] : order[11];
            const remainingQuote = remaining * price;
            const orderstatus = order[9];
            let spotPrice;
            try {
                spotPrice = this.state.lastPrices[market].price;
            } catch (e) {
                spotPrice = null;
            }
            const orderWithoutFee = getOrderDetailsWithoutFee(order);
            let orderrow;
            if (isZksyncChain(this.state.chainId))
                orderrow = {
                    td1: orderWithoutFee.price,
                    td2: orderWithoutFee.baseQuantity,
                    td3: orderWithoutFee.quoteQuantity,
                    side,
                    order: order,
                };
            else {
                orderrow = {
                    td1: price,
                    td2: remaining,
                    td3: remainingQuote,
                    side,
                    order: order,
                };
            }

            // Only display Market Making orders within 2% of spot
            // No one is going to fill outside that range
            if (
                spotPrice &&
                price > spotPrice * 0.98 &&
                price < spotPrice * 1.02
            ) {
                openOrdersData.push(orderrow);
            }
            if (side === "b" && ["o", "pm", "pf"].includes(orderstatus)) {
                orderbookBids.push(orderrow);
            } else if (
                side === "s" &&
                ["o", "pm", "pf"].includes(orderstatus)
            ) {
                orderbookAsks.push(orderrow);
            }
        }

        // Only display recent trades
        // There's a bunch of user trades in this list that are too old to display
        const fillData = [];
        const maxFillId = Math.max(...Object.values(this.state.marketFills).map(f => f[1]));
        Object.values(this.state.marketFills)
            .filter(fill => fill[1] > maxFillId - 100)
            .sort((a,b) => b[1] - a[1])
            .forEach((fill) => {
                if (isZksyncChain(this.state.chainId)) {
                    const orderWithoutFee = getFillDetailsWithoutFee(fill);
                    fillData.push({
                        td1: orderWithoutFee.price,
                        td2: orderWithoutFee.baseQuantity,
                        td3: orderWithoutFee.quoteQuantity,
                        side: fill[3],
                    });
                } else {
                    fillData.push({
                        td1: fill[4],
                        td2: fill[5],
                        td3: fill[4] * fill[5],
                        side: fill[3],
                    });
                }
            });

        if (isZksyncChain(this.state.chainId)) {
            this.state.liquidity.forEach((liq) => {
                const quantity = liq[0];
                const spread = liq[1];
                const side = liq[2];
                if (side === "d" || side === "b") {
                    const bidPrice =
                        this.state.marketSummary.price * (1 - spread);
                    orderbookBids.push({
                        td1: bidPrice,
                        td2: quantity,
                        td3: bidPrice * quantity,
                        side: "b",
                    });
                }
                if (side === "d" || side === "s") {
                    const askPrice =
                        this.state.marketSummary.price * (1 + spread);
                    orderbookAsks.push({
                        td1: askPrice,
                        td2: quantity,
                        td3: askPrice * quantity,
                        side: "s",
                    });
                }
            });
        }
        orderbookAsks.sort((a, b) => b.td1 - a.td1);
        orderbookBids.sort((a, b) => b.td1 - a.td1);
        const askBins = [];
        for (let i in orderbookAsks) {
            const lastAskIndex = askBins.length - 1;
            if (i === "0") {
                askBins.push(orderbookAsks[i]);
            } else if (orderbookAsks[i].td1 === askBins[lastAskIndex].td1) {
                askBins[lastAskIndex].td2 += orderbookAsks[i].td2;
                askBins[lastAskIndex].td3 += orderbookAsks[i].td3;
            } else {
                askBins.push(orderbookAsks[i]);
            }
        }
        const bidBins = [];
        for (let i in orderbookBids) {
            const lastBidIndex = bidBins.length - 1;
            if (i === "0") {
                bidBins.push(orderbookBids[i]);
            } else if (orderbookBids[i].td1 === bidBins[lastBidIndex].td1) {
                bidBins[lastBidIndex].td2 += orderbookBids[i].td2;
                bidBins[lastBidIndex].td3 += orderbookBids[i].td3;
            } else {
                bidBins.push(orderbookBids[i]);
            }
        }

        let openOrdersLatestTradesData;
        if (this.state.marketDataTab === "orders") {
            openOrdersLatestTradesData = openOrdersData;
        } else if (this.state.marketDataTab === "fills") {
            openOrdersLatestTradesData = fillData;
        }

        const activeOrderStatuses = ["o", "m", "b"];
        const activeUserOrders = Object.values(this.state.userOrders).filter(
            (order) => activeOrderStatuses.includes(order[9])
        ).length;

        return (
            <>
                <ToastContainer position="bottom-right" theme="colored" />
                <Header
                    user={this.state.user}
                    signInHandler={this.signInHandler.bind(this)}
                    chainId={this.state.chainId}
                    updateMarketChain={this.updateMarketChain.bind(this)}
                />
                <div className="trade_section">
                    <div className="trade_container">
                        <div className="col-12 col-xl-6 d-flex flex-column">
                            <div className="trade_left">
                                <div>
                                    {/* Trade Head */}
                                    <TradeHead
                                        updateMarketChain={this.updateMarketChain.bind(
                                            this
                                        )}
                                        marketSummary={this.state.marketSummary}
                                        markets={markets}
                                        currentMarket={this.state.currentMarket}
                                    />
                                    {/* Trade Chart */}
                                    <TradeChart
                                        currentMarket={this.state.currentMarket}
                                    />
                                </div>
                            </div>
                            <SpotBox
                                lastPrice={this.state.marketSummary.price}
                                signInHandler={this.signInHandler.bind(this)}
                                user={this.state.user}
                                chainId={this.state.chainId}
                                currentMarket={this.state.currentMarket}
                                activeOrderCount={activeUserOrders}
                            />
                        </div>
                        <div className="d-block d-xl-none" style={{"width": "100%"}}>
                            <Footer
                                userFills={this.state.userFills}
                                userOrders={this.state.userOrders}
                                user={this.state.user}
                                chainId={this.state.chainId}
                            />
                        </div>
                        <div className="col-12 col-xl-6">
                            <div className="trade_right">
                                <div className="col-12 col-sm-12 col-md-12 col-lg-6">
                                    <div className="trade_Price">
                                        {/* Trade Price Head */}
                                        {/* Trade Price Table*/}
                                        <TradePriceTable
                                            className="tpt_1"
                                            useGradient="true"
                                            priceTableData={askBins}
                                            currentMarket={
                                                this.state.currentMarket
                                            }
                                            scrollToBottom="true"
                                        />
                                    </div>
                                </div>
                                <div className="col-12 col-sm-12 col-md-12 col-lg-6">
                                    <div className="trade_price_btc">
                                        {/* <TradePriceBtcHead /> */}
                                        <TradePriceBtcTable
                                            rowData={lastPriceTableData}
                                            updateMarketChain={this.updateMarketChain.bind(
                                                this
                                            )}
                                            currentMarket={
                                                this.state.currentMarket
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="col-12 col-sm-12 col-md-12 col-lg-6">
                                    <div className="trade_Price">
                                        {/* Trade Price Second Head */}
                                        <TradePriceHeadSecond
                                            lastPrice={
                                                this.state.marketSummary.price
                                            }
                                        />
                                        {/* Trade Price Table*/}
                                        <TradePriceTable
                                            className="tpt_2"
                                            useGradient="true"
                                            currentMarket={
                                                this.state.currentMarket
                                            }
                                            priceTableData={bidBins}
                                        />
                                        {/* <TradeMarketActivites /> */}
                                    </div>
                                </div>
                                <div className="col-12 col-sm-12 col-md-12 col-lg-6">
                                    <div className="trade_Price trade_price2">
                                        {/* Trade Price Third Head */}
                                        <div className="trade_price_head_third">
                                            <strong
                                                className={
                                                    this.state.marketDataTab ===
                                                    "orders"
                                                        ? "trade_price_active_tab"
                                                        : ""
                                                }
                                                onClick={() =>
                                                    this.updateMarketDataTab(
                                                        "orders"
                                                    )
                                                }
                                            >
                                                Open Orders
                                            </strong>
                                            <strong
                                                className={
                                                    this.state.marketDataTab ===
                                                    "fills"
                                                        ? "trade_price_active_tab"
                                                        : ""
                                                }
                                                onClick={() =>
                                                    this.updateMarketDataTab(
                                                        "fills"
                                                    )
                                                }
                                            >
                                                Latest Trades
                                            </strong>
                                        </div>
                                        {/* Trade Price Table*/}
                                        <TradePriceTable
                                            className="tpt_3"
                                            value="up_value"
                                            priceTableData={
                                                openOrdersLatestTradesData
                                            }
                                            currentMarket={
                                                this.state.currentMarket
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="d-none d-xl-block">
                        <Footer
                            userFills={this.state.userFills}
                            userOrders={this.state.userOrders}
                            user={this.state.user}
                            chainId={this.state.chainId}
                        />
                    </div>
                </div>
            </>
        );
    }
}

export default Trade;