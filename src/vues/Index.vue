
<script>
import VueRangeSlider from 'vue-slider-component'
import Web3 from 'web3'
import HedgeContractArtifact from '../static/HedgeContract.json'

const WalletConnectProvider = window.WalletConnectProvider.default
const Web3Connect = window.Web3Connect.default

const BN = Web3.utils.BN

export default {
	data(){
		return {
			weeks: 2,
			ethAmount: 1,
			ethPrice: 0,
			activeHedge: null,
			hedges:[],
			connecting: false,
			processing: false,
			swapping:false,
			web3: null,
			web3Connect: null,
			provider: null,
		}
	},
	watch:{
		ethAmount(a){
			this.ethAmount = a > 5 ? 5 : a < 0 ? 0 : a
		}
	},
	mounted(){
		this.web3Connect = new Web3Connect.Core({
			cacheProvider: true,
			providerOptions: {
				walletconnect: {
					package: WalletConnectProvider,
					options: {
						infuraId: "e6e5816422864621b96685a7beb721b9"
					}
				}
			}
		});
		if (this.web3Connect.cachedProvider) {
			this.methods.connect();
		}
		//this.$el.classList.remove('loading')
		const updatePrice = () => fetch('https://api.coinmarketcap.com/v1/ticker/ethereum/')
			.then(x=>x.json())
			.then(x=>parseInt(x[0].price_usd* 100) / 100 )
			.then(price => this.ethPrice = price)
		updatePrice()
		setInterval(updatePrice, 5000)
	},
	methods:{
    connect() {
      if (this.web3) {
				if (this.provider.close) {
					this.provider.close();
				}
				if (this.web3Connect) {
					this.web3Connect.clearCachedProvider();
				}
				this.web3 = null;
				this.web3Connect = null;
        this.provider = null;
        this.account = null;
        this.hedges = [];
        //clearInterval(this.hedgesInterval)
      } else {
        this.connecting = true;
        this.web3Connect
          .connect()
          .then(provider => {
            this.provider = provider;
            const web3 = new Web3(provider);
            web3.eth
              .getAccounts()
              .then(accounts => {
                this.web3 = web3;
                this.connecting = false;
                this.account = accounts[0];
                this.contracts = {
                  Hedge: new web3.eth.Contract(
                    HedgeContractArtifact.abi,
                    "0x27b6125328ca57d5d96baAa4F9cA8C5EdBaFe016",
                    { from: accounts[0] }
                  )
                };

                return this.renewHedges();
              })
              .catch(err => {
                this.connecting = false;
              });
          })
          .catch(err => {
            this.connecting = false;
          });

        //this.hedgesInterval = setInterval(() => this.renewHedges(), 1000)
      }
    },
		hedgeActivate(){
			const {Hedge} = this.contracts
			const amount = new Web3.utils.BN(this.ethAmount * 1e10).mul(new BN(1e8))
			const value = amount.mul(new BN(this.weeks)).div(new BN(50))
							   .add(amount.div(new BN(100)))
			const period = this.weeks * 604800
			this.processing = true
			Hedge.methods.createHedge(period, amount)
				.send({value})
				.then(x => this.renewHedges())
				.then(x => this.processing = false, x => this.processing = false)

		},
		renewHedges(){
			const hedgeIDs = this.hedges.map(x=>x.id)
			let lastFoundHedge = null
			let lastFoundID = -1
			return this.contracts.Hedge.getPastEvents('HedgeCreated',{
				fromBlock:0,
				filter:{account: this.account}
			})
			.then(hedges =>  Promise.all(hedges.map(x=>x.returnValues.id).map(id =>
				this.contracts.Hedge.methods.hedges(id).call().then(x => {
					const hedge = {...x, id}
					if(!hedgeIDs.includes(id)) {
						this.hedges.push(hedge)
					} else this.hedges.filter(x=>x.id == id)[0].state = x.state
					if(id > lastFoundID && x.state == 1 && Date.now() < x.expiration * 1000){
						lastFoundHedge = hedge
						lastFoundID = id
					}
				})
			)))
			.then(() => {
				this.hedges.sort((x,y) => y.id - x.id)
				console.log('renewHedges')
				this.activeHedge = lastFoundHedge
			})
		},
		release() {
			if(this.activeHedge){
				const {id, amount:value} = this. activeHedge
				this.processing = true
				this.contracts.Hedge.methods.release(id)
					.send({value})
					.then(x => this.renewHedges())
					.then(x => this.processing = false, x => this.processing = false)
			}
		}
	},
	computed:{
		usdAmount() { return (this.ethAmount * this.ethPrice).toFixed(2) },
		loseAmount() { return (this.usdAmount / 5).toFixed(2) },
		premium() { return (this.usdAmount / 50 * this.weeks).toFixed(2)},
		ethPremium() { return parseFloat( (this.ethAmount / 50 * this.weeks).toFixed(4) )},
		ethFee(){ return parseFloat( (this.ethAmount / 100 ).toFixed(4) ) },
		ethCost() { return parseFloat( (this.ethPremium - -this.ethFee).toFixed(4) ) },
		fee(){ return (this.usdAmount / 100 ).toFixed(2) },
		cost(){ return (this.premium - -this.fee).toFixed(2) },
		expirationString() {
			return new Date( 
				this.activeHedge && this.activeHedge.expiration * 1000 ||
				Date.now() + this.weeks * 604800000
			).toLocaleDateString(undefined, { hour:"numeric", minute:"numeric" })
		}

	},
	components:{
		VueRangeSlider
	}
}
</script>
<template>
	<div class="main">
	<div class="main__page first">
		<div class="page__header">
			<a href="/" class="logo">HEGIC</a>
			<div class="tab-nemu">
				<a href="#hedge" class="mini-title m-a">Hedge contract</a>
				<a href="#use-cases" class="mini-title m-a">Use cases</a>
				<a href="#faq" class="mini-title m-a">FAQ</a>
			</div>
			<a>
				<button 
					class="button dark fix-w"
					:disabled="connecting" @click="connect">
						{{web3 ? `Disconnect : ${account}` :'Connect Wallet'}}
				</button>
			</a>
		</div>
		<div class="page-first-box">
			<div class="default-text center beta">Beta (unaudited) version. Use at your own risk.</div>
			<div class="big-title">
				Use non-custodial hedge <br>
				contracts to protect your ETH <br>
				from losses and drawdowns <br>
				in any market conditions
			</div>
			<div class="default-text center page-1">
				Hegic is an on-chain options trading protocol on Ethereum 
				that works like an insurance for your ETH. It protects your assets 
				from drawdowns and helps you to hold with a piece of mind. 
				Hegic is a non-custodial, trustless, censorship-resistant system 
				with on-chain settlement.
			</div>
			
			<div class="page-first-buttons">
				<a target="_blank" href="https://ipfs.io/ipfs/QmWy8x6vEunH4gD2gWT4Bt4bBwWX2KAEUov46tCLvMRcME">
					<button class="button">Read Whitepaper</button>
				</a>
				<a href="#hedge">
					<button class="button">Get Started</button>
				</a>
			</div>
		</div>
	</div>
	<div id="hedge" v-if="!web3" class="main__page fix-padding">
		<div class="big-title">Activate to protect the value of your ETH:</div>
		


	
		<div class="min-cards">

			<div class="min-cards__card f-1">
				<div class="mini-title center">Choose a hedge contract period:</div>
				<vue-range-slider
					tooltip="always"
					v-bind:data="[1,2,4,8]"
					v-model="weeks"
					v-bind:dot-size="25"
					v-bind:tooltip-formatter="x => `${x} week${x>1?'s':''}`"/>
			</div>
			<div class="min-cards__card f-1">
				<div class="mini-title center">How many ETH are you holding?</div>
				<div class="min-card__box b-none">
					<label class="input-with-currency" data-currency="ETH">
						<input v-model="ethAmount" min="0" max="5" step="0.001" autocomplete="off" type="number" value="1" class="input">
					</label>
				</div>
			</div>
			<div class="min-cards__card f-1">
				<div class="mini-title center opacity-0">---</div>
				<div class="min-card__box b-none">

					<a class="a-hot-fix">
						<button
							class="button dark" 
							:disabled="connecting"
							@click="connect">Connect Wallet  &amp; Activate</button>
					</a>
				</div>
			</div>

			<div class="min-cards__card f-1">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Current price of ETH
						</div>		
					</div>
					<div class="min-card__content big-value">${{ethPrice}}</div>	
				</div>
			</div>

			<div class="min-cards__card f-1">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Value of your ETH
						</div>		
					</div>
					<div class="min-card__content big-value">${{usdAmount}}</div>	
				</div>
			</div>

			<div class="min-cards__card f-1">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Your can lose  <br/> due to a -20% drawdown  <br/> of the price of ETH
						</div>
					</div>
					<div class="min-card__content big-value">-${{loseAmount}}</div>	
				</div>
			</div>



			<div class="min-cards__card f-1">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Hedge contract price (2%/week)
						</div>		
					</div>
					<div class="min-card__content big-value">${{premium}}</div>	
				</div>
			</div>

			<div class="min-cards__card f-1">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Fixed settlement fee (1%)
						</div>		
					</div>
					<div class="min-card__content big-value">${{fee}}</div>	
				</div>
			</div>

			<div class="min-cards__card f-1">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">							
							The cost of protecting your <br/> ETH from any losses <br/> or drawdowns for {{weeks}} {{weeks > 1 ? 'weeks' : 'week'}}
						</div>
					</div>
					<div class="min-card__content big-value">${{cost}}</div>	
				</div>
			</div>
		</div>

		
		<div class="mini-title">
			Holding a hedge contract gives you 
			the right to swap your ETH to DAI stablecoins
			at the current price of ETH (${{ethPrice}}) 
			in any given moment till the expiration.
		</div>
		<div class="default-text">
			You can choose the desired period 
			for such a protection: 1, 2, 4 or 8 weeks. 
			In order to have such a right, you need 
			to pay the premium plus a settlement fee.
		</div>
		<div class="default-text">
			Liquidity providers are taking the risks 
			and allocating DAI that you will be able 
			to swap ETH to for a certain fixed period.
		</div>
	</div>

	<div id="hedge" v-else-if="!activeHedge" class="main__page fix-padding">
		<div class="big-title">Activate to protect the value of your ETH:</div>
		
	
		<div class="min-cards">

			<div class="min-cards__card f-2">
				<div class="mini-title center">Choose a hedge contract period:</div>
				<vue-range-slider
					tooltip="always"
					v-bind:data="[1,2,4,8]"
					v-model="weeks"
					v-bind:dot-size="25"
					v-bind:tooltip-formatter="x => `${x} week${x>1?'s':''}`"/>
			</div>
			<div class="min-cards__card f-none"/>
			<div class="min-cards__card f-none"/>
			<div class="min-cards__card f-2">
				<div class="mini-title center">How many ETH are you holding?</div>
				<div class="min-card__box b-none">
					<label class="input-with-currency" data-currency="ETH">
						<input v-model="ethAmount" min="0" max="5" step="0.001" autocomplete="off" type="number" value="1" class="input"/>
					</label>
				</div>
			</div>

			<div class="min-cards__card f-2-4">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Current price of ETH
						</div>		
					</div>
					<div class="min-card__content big-value">${{ethPrice}}</div>	
				</div>
			</div>

			<div class="min-cards__card f-2-4">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Value of your ETH
						</div>		
					</div>
					<div class="min-card__content big-value">${{usdAmount}}</div>	
				</div>
			</div>

			<div class="min-cards__card f-2-4">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Hedge contract price(2%/week)
						</div>		
					</div>
					<div class="min-card__content big-value">${{premium}}</div>	
				</div>
			</div>

			<div class="min-cards__card f-2-4">
				<div class="min-card__box">
					<div class="min-card__head">
						<div class="m-a">
							Fixed settlement fee (1%)
						</div>		
					</div>
					<div class="min-card__content big-value">${{fee}}</div>	
				</div>
			</div>
		</div>
		<div class="flex">
			<div class="flex flex-1 flex-colunm">
				<div class="default-text">
					After clicking the "Pay and Activate" button 
					you will need to confirm the transaction for
					<span class="bold">{{ethCost}} ETH</span> in your Wallet account.
					Hedge contract will be activated immidiately 
					after the transaction is confirmed by miners.
					After that you will have a right to swap 
					<span style="white-space: nowrap;" class="bold">{{ethAmount}} ETH to {{usdAmount}} DAI</span> at any given moment 
					before the expiration on {{expirationString}}.
				</div>				
			</div>
			<div class="flex flex-1 flex-colunm page-2-right-box">
				<div class="big-title">{{ethCost}} ETH (${{cost}})</div>
				<div class="default-text">
					The total cost of the hedge contract:
					{{ethAmount}} ETH for {{weeks}} week{{weeks > 1 ? 's' : ''}} <nobr>(expires on {{expirationString}})</nobr>
				</div>
				<button v-on:click="hedgeActivate" :disabled="processing" class="button dark">Pay and Activate</button>
			</div>
		</div>
	</div>

	<div id="hedge" v-else="" class="main__page fix-padding">
		<div class="big-title">You are holding a hedge contract <br/> for {{parseInt(activeHedge.amount / 1e14) / 10000}} ETH (expires on {{expirationString}}):</div>
		
		<div class="mini-box flex flex-colunm page-2-f-3-box">
			<div class="mini-title center fix-margin-1">Amount of ETH that you can swap to DAI:</div>
			<div class="big-title m-a">
				{{parseInt(activeHedge.amount / 1e14) / 10000}} ETH
			</div>
			<div class="mini-title center">
				Amount of DAI that you will receive to your ETH-address:
			</div>
			<div class="big-title m-a">
				{{parseInt(activeHedge.strike / 1e16) / 100}} DAI
			</div>
			<button v-on:click="release" :disabled="processing" class="button">Execute and Swap</button>
		</div>			
	</div>

	<div class="main__page" v-if="web3">
		<div class="big-title">History</div>
		
		<div class="history-box">
			<div v-for="hedge in hedges" v-bind:key="hedge.id" class="history-box__history" onclick="this.classList.toggle('open')">
				<div class="history-box__header">№{{hedge.id}}: {{hedge.amount / 1e18}} ETH ({{hedge.strike / 1e18}} DAI)</div>
				<div class="history-box__content" @click.stop>
					<table>
						<tr>
							<th>Action</th>
							<th>Amount</th>
							<th>Strike</th>
							<th>Expiration date</th>
						</tr>
						<tr v-if="false">
							<td>Swap</td>
							<td>10 ETH</td>
							<td>1953 DAI</td>
							<td>23.02.2020, 10:00 UTC</td>
						</tr>
						<tr>
							<td>Activation</td>
							<td>{{hedge.amount / 1e18}} ETH</td>
							<td>{{hedge.strike / 1e18}} DAI</td>
							<td>{{new Date(hedge.expiration * 1000).toLocaleDateString(undefined, { hour:"numeric", minute:"numeric" })}}</td>
						</tr>
					</table>
				</div>
			</div>
		</div>		

	</div>

	<div id="use-cases" class="main__page third">
		<div class="big-title">Hedge contracts are great for:</div>
		<div class="tiles-info">
			<div class="tile-info">
				<div class="tile-info__box holders">
					<div class="tile-info__title">ETH Holders</div>
					<div class="tile-info__content">
						
							You want to buy more ETH for your mid/long-term portfolio, but you are unsure if the price of ETH will not drop in the next few weeks/months.
						
					</div>
				</div>
			</div>
			<div class="tile-info">
				<div class="tile-info__box traders">
					<div class="tile-info__title">ETH Traders</div>
					<div class="tile-info__content">
						
							You want to open a long (or a leveraged long) position and buy ETH, and you need to hedge your position: protect it from the potential losses.
						
					</div>
				</div>
			</div>
		</div>
		<div class="tiles-info">
			<div class="tile-info">
				<div class="tile-info__box miners">
					<div class="tile-info__title">ETH Miners</div>
					<div class="tile-info__content">
						
							You know how much ETH you will mine in the next month and you need money to cover your mining farm expenses, but you are unsure if you will have profits in the end of the month.
						
					</div>
				</div>
			</div>
			<div class="tile-info">
				<div class="tile-info__box peoples">
					<div class="tile-info__title">On-boarding new ETH holders</div>
					<div class="tile-info__content">

							You want to buy ETH for you mom, dad, friend, girlfriend or somebody else but you do not want them to lose faith in crypto if the price falls down. You and your loved ones need to have a piece of mind for the first mile of holding.

					</div>	
				</div>
			</div>
		</div>
	</div>
	<div id="faq" class="main__page">
		<div class="big-title">Learn more about hedge contracts:</div>
		<div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">What is hedge contract?</div>
				<div class="mini-box-info__content" @click.stop>
					Hedge contract is an Ethereum smart contract that gives the holder a right to swap their ETH to DAI stablecoins at a fixed rate during a certain period. Holding a hedge contract is similar to having a drawdown insurance or holding a put option contract. Hedge contract's execution is guaranteed by the code, which in turn is executed by Ethereum Virtual Machine (EVM), not by a centralized organization. You can think of a hedge contract as of a non-custodial, trustless and censorship-resistant version of a put option contract with on-chain settlement.
				</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">How does a hedge contract protect the value of my ETH?</div>
				<div class="mini-box-info__content" @click.stop>
					Liquidity providers are allocating DAI stablecoins on the liquidity pool contract. After paying for holding a hedge contract, the ETH-address that was used to conduct the payment, will be able to activate the "release" function of the hedge contract. To release DAI, the user sends ETH to the contract and automatically receives DAI that was locked for them.
				</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">How can I start using hedge contracts?</div>
				<div class="mini-box-info__content" @click.stop>
					You choose the amount of ETH that you want to hold a hedge contract for and a period of holding. Strike (execution) price of a hedge contract is always the current market price of ETH (at-the-money hedge contract). Premium and settlement fee are calculated for the chosen amount and period. After that, you will be asked to pay the amount in ETH (premium plus fee) using your Wallet account. After miners confirm the transaction, you will be able to use your ETH-address to execute the hedge contract during a certain period. In order to execute it, you should send ETH to the contract and use the release function. You will automatically receive DAI to your ETH-address.
			</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">What is the price of holding a hedge contract?</div>
				<div class="mini-box-info__content" @click.stop>
					To hold a hedge contract the user should make an upfront payment of 2% of the desired amount to hedge (premium) for each week of holding plus 1% of the amount (settlement fee). Example: if the user chooses to hold a hedge contract for 10 ETH for a period of 2 weeks, and the current price of ETH is $220, then they need to pay $88 as a premium plus $22 as a settlement fee. $2200 is the value of 10 ETH, $88 is a 4% premium (2% per week) and $22 is a 1% settlement fee.
				</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">What amount should I lock as a collateral to hold a hedge contract?</div>
				<div class="mini-box-info__content" @click.stop>
					Not a single wei. Not a single stablecent. The holder only pays a premium plus a settlement fee to have the right for swapping ETH to DAI during a certain period. ETH should not be locked on the smart contract for the period of holding a hedge contract.
				</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">How can I execute a hedge contract if your website's front-end is offline for some reasons?</div>
				<div class="mini-box-info__content" @click.stop>
					Visit https://etherscan.io/dapp, paste the hedge contract address and click the "Search" button. Connect your Wallet account and click the "Write contract" button. Go to the "Release" section (2). Paste number that is equal to the amount of ETH that you have activated a hedge contract for (for example, 1) and your hedgeID (for example, 20). Your hedgeID can be found in the Event logs of the ETH-transaction of activating the hedge contract (data = your hedgeID). Click the "Write" button and approve the transaction. ETH will be sent from your ETH-address and you will automatically receive DAI from the liquidity pool contract.
				</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">What if you will not agree to swap my ETH to DAI after the price dropped?</div>
				<div class="mini-box-info__content" @click.stop>
					The liquidity that you have paid for is locked on the hedge contract for you. Nobody can reject you from releasing it (swap ETH to DAI) when the price of ETH drops. That is the purpose of hedge contracts: to protect your assets from the price drawdowns and guarantee you that you will be able to swap your ETH to DAI if the price of ETH dropped.
				</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">Whom do I swap my ETH to DAI with when executing a hedge contract?</div>
				<div class="mini-box-info__content" @click.stop>
					Liquidity providers are allocating DAI on the liquidity pool contract. You are swapping ETH to DAI with a smart contract, not an individual. When a hedge contract is active, the liquidity in DAI is locked. You have a code-based guarantee to be able to swap your ETH to DAI when the market price of ETH is lower than the amount of DAI on the hedge contract that you are holding.
				</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">What are the terms and conditions of Hegic?</div>
				<div class="mini-box-info__content" @click.stop>
					WARNING: Hegic is an unstoppable software in beta that has not been audited yet. Use it at your own risk. The terms are: if you want to hold a hedge contract, you can pay for it and use it. If you do not want to use it, you do not pay for it. Hope that your life and health conditions will let you to use hedge contracts. Code is open sourced on Github. DYOR. Thank you for your time spent on reading the terms & conditions. If you do not agree with them, please consider leaving this website immediately.
				</div>
			</div>
			<div class="mini-box-info" onclick="this.classList.toggle('open')">
				<div class="mini-box-info__title">What is the privacy policy of Hegic?</div>
				<div class="mini-box-info__content" @click.stop>
					You will need to use a Web3 wallet called Wallet to hold and execute hedge contracts. You are unveiling your public key and everybody can discover that you have used hedge contracts. Hope that you keep your public keys (and your private keys, goddammit) in a safe and private place. You will not be asked to provide any of your personal information or CVV code of your credit card. Thank you for your time spent on reading the privacy policy. If you do not agree with it, please consider leaving this website immediately.
				</div>
			</div>
		</div>
	</div>
	<div class="main__footer">
		<div class="links">				
			<a target="_blank" href="https://ipfs.io/ipfs/QmWy8x6vEunH4gD2gWT4Bt4bBwWX2KAEUov46tCLvMRcME" class="links__link">Whitepaper</a>
			<a target="_blank" href="http://github.com/hegic" class="links__link">Github</a>
			<a target="_blank" href="https://twitter.com/HegicOptions" class="links__link">Twitter</a>
			<a target="_blank" href="https://t.me/HegicOptions" class="links__link">Telegram</a>
			<a target="_blank" href="https://discord.gg/znjdj8q" class="links__link">Discord</a>
		</div>

		<div class="copyright">
			2020 © Hegic: On-chain options trading protocol on Ethereum.
		</div>
	</div>
	</div>
</template>
