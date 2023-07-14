import { NameDto } from './../dto/name.dto';
import { FnsPublicResolverAddressChanged } from './../entity/fns.public.resolver.address.changed';
import { FnsRegistryTransfer } from 'src/entity/fns.registry.transfer';
import { FnsRegistryResolver } from 'src/entity/fns.registry.resolver';
import { FnsRegistrarRegistered } from '../entity/fns.registrar.registered';
import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from 'src/utils/cache/cache.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Not, Repository } from 'typeorm';
import { registryAbi } from '../abi/registry.abi';
import { registrarControllerAbi } from '../abi/registrar.controller.abi';
import { publicResolverAbi } from '../abi/public.resolver.abi';
import { registrarAbi } from '../abi/registrar.abi'
import { ethers, utils } from 'ethers';
import { PageDto, PageList } from 'src/dto/page.dto';
import { TransactionDto } from 'src/dto/transaction.dto';
import { unionWith, uniqBy } from 'lodash'
var namehash = require('eth-ens-namehash')

const rpcUrl = 'https://filfox.info/rpc/v1'
const provider = new ethers.providers.JsonRpcProvider(rpcUrl)


const registrarContract = new ethers.Contract(
  '0x45d9d6408d5159a379924cf423cb7e15C00fA81f',
  registrarAbi,
  provider
)


// Registrar
const registrarControllerContract = new ethers.Contract(
  '0xDA3c407a23Ef96930f1A07903fB8360D8926991E',
  registrarControllerAbi as any,
  provider
)

// Transfer Resolver
const registryContract = new ethers.Contract(
  '0x916915d0d41EaA8AAEd70b2A5Fb006FFc213961b',
  registryAbi as any,
  provider
)

// AddressChanged
const publicResolverContract = new ethers.Contract(
  '0xed9bd04b1BB87Abe2EfF583A977514940c95699c',
  publicResolverAbi as any,
  provider
)

const START_BLOCK = 3027733

let registrarRegisteredHeight = START_BLOCK
let registryTransferHeight = START_BLOCK
let registryResolverHeight = START_BLOCK
let publicResolverHeight = START_BLOCK

@Injectable()
export class FnsService {
  constructor(
    private readonly cacheService: CacheService,
    @InjectRepository(FnsRegistrarRegistered) private fnsRegistrarRegisteredRepository: Repository<FnsRegistrarRegistered>,
    @InjectRepository(FnsRegistryTransfer) private fnsRegistryTransferRepository: Repository<FnsRegistryTransfer>,
    @InjectRepository(FnsRegistryResolver) private fnsRegistryResolverRepository: Repository<FnsRegistryResolver>,
    @InjectRepository(FnsPublicResolverAddressChanged) private fnsPublicResolverAddressChangedRepository: Repository<FnsPublicResolverAddressChanged>,
  ) {}

  private readonly logger = new Logger(FnsService.name)

  async asyncRegistrarRegistered() {
    try {
      const blockHeightNow = await provider.getBlockNumber()
      const filter = registrarContract.filters.NameRegistered()
      this.logger.log(`start sync NameRegistered events from : ${registrarRegisteredHeight}`)
      let nodes: any[] = (await registrarContract.queryFilter(filter, registrarRegisteredHeight, Math.min(registrarRegisteredHeight + 1000, blockHeightNow)))
      
      for (let i in nodes) { nodes[i].id = nodes[i].args.id }
      nodes = uniqBy(nodes, 'id')

      for (let i in nodes) {
        const _node:FnsRegistrarRegistered = new FnsRegistrarRegistered()
        _node.blockNumber = nodes[i].blockNumber
        _node.type = 'NameRegistered'
        _node.name = await this.getNameByTokenId(nodes[i].args.id)
        _node.owner = nodes[i].args.owner
        _node.ownerFilAddress = ''
        _node.transactionHash = nodes[i].transactionHash
        _node.expires = nodes[i].args.expires.toNumber()
        const exist: FnsRegistrarRegistered[] = await this.fnsRegistrarRegisteredRepository.find({
          where: {
            name: _node.name,
            type: 'NameRegistered'
          }
        })
        if (!exist.length) await this.fnsRegistrarRegisteredRepository.save(_node)
      }

      registrarRegisteredHeight = Math.min(registrarRegisteredHeight + 1000, blockHeightNow)
      this.logger.log(`finished : get ${nodes.length} NameRegistered events`)
    } catch (error) {
      this.logger.error(error)
    }
  }

  async getNameByTokenId(tokenId: string){
    let name = ''

    try {
      name = (await registrarContract.nameOf(tokenId))
    } catch (error) {
      name = ''
    }

    return name ? `${name}.fil` : tokenId
  }

  // 扫描 NameRegistered 事件表，校准 name
  async checkNameRegistered() {
    try {
      const events = await this.fnsRegistrarRegisteredRepository.find({
        where: {
          name: Not(Like('%.fil')),
          type: 'NameRegistered'
        }
      })

      if (!events.length) {
        return
      }

      for (let i = 0; i < events.length; i++) {
        const tokenId = events[i].name
        this.logger.log(`Filling ${tokenId}...`)

        const name = await this.getNameByTokenId(tokenId)
        if (!/\.fil$/.test(name)) continue

        await this.fnsRegistrarRegisteredRepository.update({ name: tokenId }, { name })
        this.logger.log(`${tokenId} : ${name}`)
      }

      this.logger.log(`Checked ${events.length} names`)
    } catch (error) {
      this.logger.error('checkNameRegistered() error:', error)
    } finally {
      setTimeout(() => this.checkNameRegistered(), 1000 * 15)
    }
  }

  async asyncRegistryTransfer() {
    try {
      const blockHeightNow = await provider.getBlockNumber()
      const filter = registryContract.filters.Transfer()
      let nodes = (await registryContract.queryFilter(filter, registryTransferHeight, Math.min(registryTransferHeight + 1000, blockHeightNow)))
      for (let i in nodes) {
        try {
          const _node:FnsRegistryTransfer = new FnsRegistryTransfer()
          _node.blockNumber = nodes[i].blockNumber
          _node.type = 'Transfer'
          _node.owner = nodes[i].args.owner
          _node.ownerFilAddress = ''
          _node.transactionHash = nodes[i].transactionHash
          const exist: FnsRegistryTransfer[] = await this.fnsRegistryTransferRepository.find({
            where: {
              owner: _node.owner,
              transactionHash: _node.transactionHash
            }
          })
          if (!exist.length) {
            await this.fnsRegistryTransferRepository.save(_node)
          }
        } catch {}
      }
      registryTransferHeight = Math.min(registryTransferHeight + 1000, blockHeightNow)
    } catch {}
  }

  async asyncRegistryResolver() {
    try {
      const blockHeightNow = await provider.getBlockNumber()
      const filter = registryContract.filters.NewResolver()
      let nodes = (await registryContract.queryFilter(filter, registryResolverHeight, Math.min(registryResolverHeight + 1000, blockHeightNow)))
      nodes = unionWith(nodes, (a, b) => {
        return a.blockNumber === b.blockNumber && a.transactionIndex === b.transactionIndex
      })
      for (let i in nodes) {
        try {
          const _node:FnsRegistryResolver = new FnsRegistryResolver()
          _node.blockNumber = nodes[i].blockNumber
          _node.type = 'Resolver'
          _node.resolver = nodes[i].args.resolver
          _node.resolverFilAddress = ''
          _node.transactionHash = nodes[i].transactionHash
          _node.owner = await registryContract.owner(nodes[i].args.node)
          _node.owner = ''
          const exist: FnsRegistryResolver[] = await this.fnsRegistryResolverRepository.find({
            where: {
              resolver: _node.resolver,
              transactionHash: _node.transactionHash
            }
          })
          if (!exist.length) {
            await this.fnsRegistryResolverRepository.save(_node)
          }
        } catch {}
      }
      registryResolverHeight = Math.min(registryResolverHeight + 1000, blockHeightNow)
    } catch {}
  }

  async asyncPublicResolver() {
    try {
      const blockHeightNow = await provider.getBlockNumber()
      const filter = publicResolverContract.filters.AddressChanged()
      let nodes = (await publicResolverContract.queryFilter(filter, publicResolverHeight, Math.min(publicResolverHeight + 1000, blockHeightNow)))
      nodes = unionWith(nodes, (a, b) => {
        return a.blockNumber === b.blockNumber && a.transactionIndex === b.transactionIndex
      })
      for (let i in nodes) {
        try {
          const _node:FnsPublicResolverAddressChanged = new FnsPublicResolverAddressChanged()
          _node.blockNumber = nodes[i].blockNumber
          _node.type = 'AddressChanged'
          _node.newAddress = nodes[i].args.newAddress
          _node.node = nodes[i].args.node
          _node.coinType = nodes[i].args.coinType.toNumber()
          _node.transactionHash = nodes[i].transactionHash
          _node.owner = await registryContract.owner(nodes[i].args.node)
          _node.owner = ''
          const exist: FnsPublicResolverAddressChanged[] = await this.fnsPublicResolverAddressChangedRepository.find({
            where: {
              newAddress: _node.newAddress,
              transactionHash: _node.transactionHash
            }
          })
          if (!exist.length) {
            await this.fnsPublicResolverAddressChangedRepository.save(_node)
          }
        } catch {}
      }
      publicResolverHeight = Math.min(publicResolverHeight + 1000, blockHeightNow)
    } catch {}
  }

  async getRegisteredByPage(page: PageDto): Promise<PageList<FnsRegistrarRegistered>> {
    // cache
    // await this.cacheService.get(`filfox:fns:registered`);
    const [list, total] = await this.fnsRegistrarRegisteredRepository.findAndCount({
      order: {
        blockNumber: "DESC"
      },
      skip: page.page * page.pageSize,
      take: page.pageSize
    })
    return {
      total,
      list
    }
  }

  async getTransactionsByAddress(address: string): Promise<TransactionDto[]> {
    const searchParams = {
      where: {
        owner: address
      }
    }
    let list = await Promise.all([
      this.fnsRegistrarRegisteredRepository.find(searchParams),
      this.fnsRegistryTransferRepository.find(searchParams),
      this.fnsRegistryResolverRepository.find(searchParams),
      this.fnsPublicResolverAddressChangedRepository.find(searchParams)
    ])
    let format = []
    list.forEach(item => format.push(...item))
    return format.sort((a, b) => {
      return b.blockNumber - a.blockNumber
    })
  }

  async asyncFnsNames() {
    try {
      const list: FnsRegistrarRegistered[] = await this.fnsRegistrarRegisteredRepository.find()
      let searchList = []
      let outPutList = []
      list.forEach(item => {
        searchList.push(item.owner)
      })
      searchList = [...new Set(searchList)]
      for (let i in searchList) {
        try {
          const l = utils.namehash(namehash.normalize(`${searchList[i].substring(2).toLocaleLowerCase()}.addr.reverse`))
          const name = await publicResolverContract.name(l)
          outPutList.push({
            owner: searchList[i],
            name
          })
        } catch {}
      }
      if (outPutList.length) {
        await this.cacheService.set(`filfox:fns:registered`, outPutList, null);
      }
    } catch {}
  }

  async findName(address: string): Promise<NameDto> {
    const list = await this.cacheService.get('filfox:fns:registered') || []
    const item = list.find((item: NameDto) => item.owner.toLocaleLowerCase() === address.toLocaleLowerCase())
    return item || { owner: '', name: ''}
  }
}


