import { NameDto } from './../dto/name.dto';
import { FnsPublicResolverAddressChanged } from './../entity/fns.public.resolver.address.changed';
import { FnsRegistryTransfer } from 'src/entity/fns.registry.transfer';
import { FnsRegistryResolver } from 'src/entity/fns.registry.resolver';
import { FnsRegistrarRegistered } from '../entity/fns.registrar.registered';
import { Injectable } from '@nestjs/common';
import { CacheService } from 'src/utils/cache/cache.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { registryAbi } from '../abi/registry.abi';
import { registrarControllerAbi } from '../abi/registrar.controller.abi';
import { publicResolverAbi } from '../abi/public.resolver.abi';
import { ethers, utils } from 'ethers';
import { PageDto, PageList } from 'src/dto/page.dto';
import { TransactionDto } from 'src/dto/transaction.dto';
import { unionWith } from 'lodash'
var namehash = require('eth-ens-namehash')

const rpcUrl = 'https://calibration.filfox.info/rpc/v1'
const provider = new ethers.providers.JsonRpcProvider(rpcUrl)

// Registrar
const registrarControllerContract = new ethers.Contract(
  '0xc5b7f7f5dFB7f16F74476564Fe2e3B5a7C182Cd4',
  registrarControllerAbi as any,
  provider
)

// Transfer Resolver
const registryContract = new ethers.Contract(
  '0x0381f0c42f542DEcEBC3ea1A27B3eF4ac1F258b6',
  registryAbi as any,
  provider
)

// AddressChanged
const publicResolverContract = new ethers.Contract(
  '0x7EEa7D977fff536d9B8752a5dF24A00E288c1B43',
  publicResolverAbi as any,
  provider
)

let registrarRegisteredHeight = 602958
let registryTransferHeight = 602958
let registryResolverHeight = 602958
let publicResolverHeight = 602958

@Injectable()
export class FnsService {
  constructor(
    private readonly cacheService: CacheService,
    @InjectRepository(FnsRegistrarRegistered) private fnsRegistrarRegisteredRepository: Repository<FnsRegistrarRegistered>,
    @InjectRepository(FnsRegistryTransfer) private fnsRegistryTransferRepository: Repository<FnsRegistryTransfer>,
    @InjectRepository(FnsRegistryResolver) private fnsRegistryResolverRepository: Repository<FnsRegistryResolver>,
    @InjectRepository(FnsPublicResolverAddressChanged) private fnsPublicResolverAddressChangedRepository: Repository<FnsPublicResolverAddressChanged>,
  ) {}

  async asyncFnsEvents() {
    try {
      const promiseList = [
        this.asyncRegistrarRegistered(),
        this.asyncRegistryTransfer(),
        this.asyncRegistryResolver(),
        this.asyncPublicResolver()
      ]
      await Promise.all(promiseList)
    } catch (error) {
      console.log(error)
    }
  }

  async asyncRegistrarRegistered() {
    try {
      const blockHeightNow = await provider.getBlockNumber()
      const filter = registrarControllerContract.filters.NameRegistered()
      let nodes = (await registrarControllerContract.queryFilter(filter, registrarRegisteredHeight, Math.min(registrarRegisteredHeight + 1000, blockHeightNow)))
      console.log(registrarRegisteredHeight)
      for (let i in nodes) {
        try {
          const _node:FnsRegistrarRegistered = new FnsRegistrarRegistered()
          _node.blockNumber = nodes[i].blockNumber
          _node.type = 'NameRegistered'
          _node.name = nodes[i].args.name + '.fil'
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
          if (!exist.length) {
            await this.fnsRegistrarRegisteredRepository.save(_node)
          }
        } catch(error) {
          console.log(error)
        }
      }
      registrarRegisteredHeight = Math.min(registrarRegisteredHeight + 1000, blockHeightNow)
    } catch {
      
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
    } catch {
    }
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
    } catch {
    }
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
    } catch {
    }
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
        } catch {

        }
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


